import { expandIRI, SolidDocument, SparqlUpdate, turtleToQuadsSync } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import type Operation from 'soukai-bis/models/crdts/Operation';
import { describe, expect, it } from 'vite-plus/test';

import { applyOperationsToDocument, getSyncDocumentOperations } from './sync-document-operations';

describe('Sync document operations', () => {
    type OperationType = 'Set' | 'Unset' | 'Add' | 'Remove';
    type OperationDefinition = [type: OperationType, day: number, values?: string[]];

    const documentUrl = fakeDocumentUrl();
    const resourceUrl = `${documentUrl}#it`;

    it('keeps items added in different devices', async () => {
        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                ],
            ],
            [
                ['a', 'c'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 3, ['c']],
                ],
            ],
            ['a', 'b', 'c'],
        );
    });

    it('keeps items added and removed in different devices', async () => {
        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                ],
            ],
            [
                [],
                [
                    ['Set', 1, ['a']],
                    ['Remove', 3, ['a']],
                ],
            ],
            ['b'],
        );
    });

    it('replaces older items with newer sets and unsets', async () => {
        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                ],
            ],
            [
                ['z'],
                [
                    ['Set', 1, ['a']],
                    ['Set', 3, ['z']],
                ],
            ],
            ['z'],
        );

        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                ],
            ],
            [
                [],
                [
                    ['Set', 1, ['a']],
                    ['Unset', 3],
                ],
            ],
            [],
        );
    });

    it('keeps newer items after older sets', async () => {
        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 3, ['b']],
                ],
            ],
            [
                ['z'],
                [
                    ['Set', 1, ['a']],
                    ['Set', 2, ['z']],
                ],
            ],
            ['b', 'z'],
        );
    });

    it('removes newer items after older sets', async () => {
        await expectMerge(
            [
                [],
                [
                    ['Set', 1, ['a']],
                    ['Remove', 3, ['a']],
                ],
            ],
            [
                ['a', 'x'],
                [
                    ['Set', 1, ['a']],
                    ['Set', 2, ['a', 'x']],
                ],
            ],
            ['x'],
        );
    });

    it('does not restore items removed later', async () => {
        await expectMerge(
            [
                ['a'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                    ['Remove', 4, ['b']],
                ],
            ],
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 3, ['b']],
                ],
            ],
            ['a'],
        );
    });

    it('applies adds after removes with the same date', async () => {
        await expectMerge(
            [
                [],
                [
                    ['Set', 1, ['a']],
                    ['Remove', 2, ['a']],
                ],
            ],
            [
                ['a'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['a']],
                ],
            ],
            ['a'],
        );
    });

    it('applies adds after sets with the same date', async () => {
        await expectMerge(
            [
                ['a', 'b'],
                [
                    ['Set', 1, ['a']],
                    ['Add', 2, ['b']],
                ],
            ],
            [
                ['z'],
                [
                    ['Set', 1, ['a']],
                    ['Set', 2, ['z']],
                ],
            ],
            ['b', 'z'],
        );
    });

    function createDocument(members: string[], operations: OperationDefinition[]): SolidDocument {
        const operationsTurtle = operations.map(([type, day, values = []]) => {
            const date = new Date(Date.UTC(2021, 0, day)).toISOString();
            const valuesTurtle =
                values.length > 0 ? `; crdt:value ${values.map((value) => `<#${value}>`).join(', ')}` : '';

            return `
                <#it-operation-${type}-${day}-${values.join('')}>
                    a crdt:${type}PropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "${date}"^^xsd:dateTime ;
                    crdt:property foaf:member
                    ${valuesTurtle} .
            `;
        });
        const membersTurtle =
            members.length > 0 ? `; foaf:member ${members.map((member) => `<#${member}>`).join(', ')}` : '';
        const turtle = `
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .
            @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
            @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

            <#it> a foaf:Group ${membersTurtle} .

            ${operationsTurtle.join('\n')}
        `;

        return new SolidDocument(documentUrl, turtleToQuadsSync(turtle, { baseIRI: documentUrl }));
    }

    function getMembers(document: SolidDocument): string[] {
        return document
            .statements(resourceUrl, expandIRI('foaf:member'))
            .map((quad) => quad.object.value.split('#')[1] as string)
            .sort();
    }

    function applySparql(document: SolidDocument, operations: EngineOperation[]): SolidDocument {
        const engine = new SolidEngine() as unknown as {
            filterSupersededOperations(operations: EngineOperation[]): EngineOperation[];
        };
        const sparql = new SparqlUpdate(document);

        for (const operation of engine.filterSupersededOperations(operations)) {
            operation.applyToSparql(sparql);
        }

        const quads = document
            .getQuads()
            .filter((quad) => !sparql.deletes.some((deletedQuad) => deletedQuad.equals(quad)))
            .concat(sparql.inserts);

        return new SolidDocument(document.url, quads);
    }

    async function readOperations(document: SolidDocument): Promise<Operation[]> {
        const operations = await Promise.all(
            getCoreOperationModels().map((operationModel) => operationModel.createManyFromDocument(document)),
        );

        return operations.flat() as Operation[];
    }

    async function merge(document: SolidDocument, otherDocument: SolidDocument): Promise<string[]> {
        const existingOperations = await readOperations(document);
        const existingUrls = new Set(existingOperations.map((operation) => operation.url));
        const otherOperations = await readOperations(otherDocument);
        const operations = await getSyncDocumentOperations({
            document,
            otherDocument,
            existingOperations,
            newOperations: otherOperations.filter((operation) => !existingUrls.has(operation.url)),
            resourceUrls: [resourceUrl],
        });
        const members = getMembers(applyOperationsToDocument(document, operations));

        expect(getMembers(applySparql(document, operations))).toEqual(members);

        return members;
    }

    async function expectMerge(
        [members, operations]: [string[], OperationDefinition[]],
        [otherMembers, otherOperations]: [string[], OperationDefinition[]],
        expected: string[],
    ): Promise<void> {
        const document = createDocument(members, operations);
        const otherDocument = createDocument(otherMembers, otherOperations);

        expect(await merge(document, otherDocument)).toEqual(expected);
        expect(await merge(otherDocument, document)).toEqual(expected);
    }
});

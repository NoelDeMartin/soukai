import { expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import AddPropertyOperation from 'soukai-bis/models/crdts/AddPropertyOperation';
import type Operation from 'soukai-bis/models/crdts/Operation';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import RemovePropertyOperation from 'soukai-bis/models/crdts/RemovePropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import UnsetPropertyOperation from 'soukai-bis/models/crdts/UnsetPropertyOperation';
import type { ModelWithUrl } from 'soukai-bis/models/types';
import Group from 'soukai-bis/testing/stubs/Group';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const BERSERK = 'https://berserk.fandom.com/wiki/';

describe('CRDTs', () => {
    let engine: InMemoryEngine;

    function propertyOperations(operations: unknown, property: string): PropertyOperation[] {
        return ((operations ?? []) as Operation[]).filter(
            (operation) => (operation as PropertyOperation).property === expandIRI(`foaf:${property}`),
        ) as PropertyOperation[];
    }

    function operationValues(operation: PropertyOperation | undefined): string[] {
        return (operation as SetPropertyOperation | undefined)?.values.map((value) => value.value) ?? [];
    }

    beforeEach(() => {
        setEngine((engine = new InMemoryEngine()));
    });

    it('records add and remove operations', async () => {
        // Arrange
        const group = (await Group.create({
            name: 'Band of the Falcon',
            memberUrls: [`${BERSERK}Griffith`, `${BERSERK}Casca`, `${BERSERK}Judeau`],
        })) as ModelWithUrl<Group>;

        vi.advanceTimersByTime(1000);

        // Act
        await group.update({ memberUrls: [`${BERSERK}Griffith`, `${BERSERK}Casca`, `${BERSERK}Guts`] });

        // Assert
        const freshGroup = await Group.findOrFail(group.url);
        const operations = await freshGroup.loadRelation('operations');
        const memberOperations = propertyOperations(operations, 'member');
        const addOperation = memberOperations.find((operation) => operation instanceof AddPropertyOperation);
        const removeOperation = memberOperations.find((operation) => operation instanceof RemovePropertyOperation);

        expect(memberOperations).toHaveLength(3);
        expect(memberOperations.filter((operation) => operation instanceof SetPropertyOperation)).toHaveLength(1);
        expect(addOperation?.date.getTime()).toEqual(Date.now());
        expect(operationValues(addOperation)).toEqual([`${BERSERK}Guts`]);
        expect((addOperation as AddPropertyOperation).values[0]?.termType).toEqual('NamedNode');
        expect(removeOperation?.date.getTime()).toEqual(Date.now());
        expect(operationValues(removeOperation)).toEqual([`${BERSERK}Judeau`]);
        expect(freshGroup.memberUrls).toEqual([`${BERSERK}Griffith`, `${BERSERK}Casca`, `${BERSERK}Guts`]);
    });

    it('records remove operations when emptying arrays', async () => {
        // Arrange
        const group = (await Group.create({
            name: 'Straw Hat Pirates',
            nicknames: ['Mugiwaras', 'Straw Hats'],
        })) as ModelWithUrl<Group>;

        vi.advanceTimersByTime(1000);

        // Act
        await group.update({ nicknames: [] });

        // Assert
        const operations = await (await Group.findOrFail(group.url)).loadRelation('operations');
        const nickOperations = propertyOperations(operations, 'nick');
        const removeOperation = nickOperations.find((operation) => operation instanceof RemovePropertyOperation);

        expect(nickOperations).toHaveLength(2);
        expect(nickOperations.some((operation) => operation instanceof UnsetPropertyOperation)).toBe(false);
        expect(operationValues(removeOperation).sort()).toEqual(['Mugiwaras', 'Straw Hats']);
    });

    it('does not record unchanged values', async () => {
        // Arrange
        const group = (await Group.create({
            name: 'Straw Hat Pirates',
            nicknames: ['Mugiwaras', 'Straw Hats'],
        })) as ModelWithUrl<Group>;

        vi.advanceTimersByTime(1000);

        // Act
        await group.update({ nicknames: ['Straw Hats', 'Mugiwaras'], name: 'Mugiwara Pirates' });

        // Assert
        const operations = await (await Group.findOrFail(group.url)).loadRelation('operations');

        expect(propertyOperations(operations, 'nick')).toHaveLength(1);
        expect(propertyOperations(operations, 'name')).toHaveLength(2);
    });

    it('ignores duplicated items', async () => {
        // Arrange
        const group = (await Group.create({
            name: 'Straw Hat Pirates',
            nicknames: ['Mugiwaras'],
        })) as ModelWithUrl<Group>;

        vi.advanceTimersByTime(1000);

        // Act
        await group.update({ nicknames: ['Mugiwaras', 'Straw Hats', 'Straw Hats'] });

        // Assert
        const freshGroup = await Group.findOrFail(group.url);
        const operations = await freshGroup.loadRelation('operations');
        const addOperation = propertyOperations(operations, 'nick').find(
            (operation) => operation instanceof AddPropertyOperation,
        );
        const document = await engine.readDocument(group.requireDocumentUrl());

        expect(operationValues(addOperation)).toEqual(['Straw Hats']);
        expect(document.statements(group.url, expandIRI('foaf:nick'))).toHaveLength(2);
    });

    it('records set and unset operations for single-valued fields', async () => {
        // Arrange
        const group = (await Group.create({
            name: 'Band of the Falcon',
            makerUrl: `${BERSERK}Griffith`,
        })) as ModelWithUrl<Group>;

        vi.advanceTimersByTime(1000);

        // Act
        await group.update({ makerUrl: undefined });

        // Assert
        const operations = await (await Group.findOrFail(group.url)).loadRelation('operations');
        const makerOperations = propertyOperations(operations, 'maker');

        expect(makerOperations).toHaveLength(2);
        expect(makerOperations[0]).toBeInstanceOf(SetPropertyOperation);
        expect(makerOperations[1]).toBeInstanceOf(UnsetPropertyOperation);
    });

    it('records inception operations before the first add', async () => {
        // Arrange
        const documentUrl = 'local://groups/falcon';

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(`
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <${documentUrl}#it>
                    a foaf:Group ;
                    foaf:name "Band of the Falcon" ;
                    foaf:member <${BERSERK}Griffith> .

                <${documentUrl}#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <${documentUrl}#it> ;
                    crdt:createdAt "1991-01-11T00:00:00.000Z"^^xsd:dateTime ;
                    crdt:updatedAt "1991-01-11T00:00:00.000Z"^^xsd:dateTime .
            `),
        );

        const group = await Group.findOrFail(`${documentUrl}#it`);

        // Act
        await group.update({ memberUrls: [`${BERSERK}Griffith`, `${BERSERK}Guts`] });

        // Assert
        const operations = await (await Group.findOrFail(group.url)).loadRelation('operations');
        const memberOperations = propertyOperations(operations, 'member').sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
        );

        expect(memberOperations).toHaveLength(2);
        expect(memberOperations[0]).toBeInstanceOf(SetPropertyOperation);
        expect(memberOperations[0]?.date).toEqual(new Date('1991-01-11T00:00:00.000Z'));
        expect(operationValues(memberOperations[0])).toEqual([`${BERSERK}Griffith`]);
        expect(memberOperations[1]).toBeInstanceOf(AddPropertyOperation);
        expect(operationValues(memberOperations[1])).toEqual([`${BERSERK}Guts`]);
    });

    it('syncs operations from soukai-solid', async () => {
        // Arrange
        const documentUrl = 'local://groups/falcon';

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(
                `
                    @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                    @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                    <#it>
                        a foaf:Group ;
                        foaf:name "Band of the Falcon" ;
                        foaf:member <${BERSERK}Griffith>, <${BERSERK}Judeau> ;
                        foaf:maker <#griffith> .

                    <#it-metadata>
                        a crdt:Metadata ;
                        crdt:resource <#it> ;
                        crdt:createdAt "1991-01-11T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:updatedAt "1996-05-24T00:00:00.000Z"^^xsd:dateTime .

                    <#it-operation-1>
                        a crdt:SetPropertyOperation ;
                        crdt:resource <#it> ;
                        crdt:date "1991-01-11T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:property foaf:name ;
                        crdt:value "Band of the Falcon" .

                    <#it-operation-2>
                        a crdt:SetPropertyOperation ;
                        crdt:resource <#it> ;
                        crdt:date "1991-01-11T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:property foaf:member ;
                        crdt:value
                            <${BERSERK}Griffith>,
                            <${BERSERK}Casca>,
                            <${BERSERK}Judeau>,
                            <${BERSERK}Pippin>,
                            <${BERSERK}Corkus> .

                    <#it-operation-3>
                        a crdt:SetPropertyOperation ;
                        crdt:resource <#it> ;
                        crdt:date "1991-01-11T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:property foaf:maker ;
                        crdt:value <#griffith> .

                    <#it-operation-4>
                        a crdt:AddPropertyOperation ;
                        crdt:resource <#it> ;
                        crdt:date "1992-01-01T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:property foaf:member ;
                        crdt:value <${BERSERK}Guts> .

                    <#it-operation-5>
                        a crdt:RemovePropertyOperation ;
                        crdt:resource <#it> ;
                        crdt:date "1996-05-24T00:00:00.000Z"^^xsd:dateTime ;
                        crdt:property foaf:member ;
                        crdt:value
                            <${BERSERK}Judeau>,
                            <${BERSERK}Pippin>,
                            <${BERSERK}Corkus> .
                `,
                { baseIRI: documentUrl },
            ),
        );

        const group = await Group.findOrFail(`${documentUrl}#it`);
        const operations = await group.loadRelation('operations');

        // Act
        await group.syncOperations();

        // Assert
        expect(propertyOperations(operations, 'member')).toHaveLength(3);
        expect(group.memberUrls?.slice().sort()).toEqual([`${BERSERK}Casca`, `${BERSERK}Griffith`, `${BERSERK}Guts`]);
        expect(group.makerUrl).toEqual(`${documentUrl}#griffith`);
    });
});

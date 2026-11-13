import { quadsToTurtle, turtleToQuads } from '@noeldemartin/solid-utils';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import { setEngine } from 'soukai-bis/engines/state';
import InvalidAttributesError from 'soukai-bis/errors/InvalidAttributesError';
import type PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { bootModels } from 'soukai-bis/models/registry';
import { remote } from 'soukai-bis/models/remote';
import { defineSchema } from 'soukai-bis/models/schema';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { useFakeClock } from 'soukai-bis/testing/utils/clock';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';

const SCHEMA = 'https://schema.org/';
const ICAL = 'http://www.w3.org/2002/12/cal/ical#';
const PURL = 'http://purl.org/dc/terms/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

class HistoryTask extends defineSchema(Task, {
    history: true,
    rdfDefaultResourceHash: '',
    fields: {
        description: z.string().optional(),
        priority: z.number().optional(),
    },
}) {}

const HistoryTaskICalSchema = defineSchema(TaskICalSchema, {
    history: true,
    rdfContexts: { schema: SCHEMA },
    fields: {
        description: z.string().rdfProperties(['schema:description', 'description']).optional(),
        status: z.string().rdfProperty('status'),
    },
    hooks: {
        beforeInitialize(attributes) {
            attributes.status ??= 'NEEDS-ACTION';
        },
    },
});

function subjectStatements(quads: Quad[], subject: string): Record<string, string[]> {
    const statements: Record<string, string[]> = {};

    for (const quad of quads) {
        if (quad.subject.value !== subject) {
            continue;
        }

        (statements[quad.predicate.value] ??= []).push(quad.object.value);
    }

    for (const values of Object.values(statements)) {
        values.sort();
    }

    return statements;
}

describe('Schema migrations', () => {
    let engine: InMemoryEngine;

    beforeEach(() => {
        setEngine((engine = new InMemoryEngine()));
        bootModels({ HistoryTask }, { reset: true });
    });

    async function documentQuads(documentUrl: string): Promise<Quad[]> {
        return (await engine.readDocument(documentUrl)).getQuads();
    }

    it('migrates models with history', async () => {
        // Arrange
        useFakeClock();

        const createdAt = new Date();
        const task = await HistoryTask.create({ name: 'Learn Solid', priority: 1 });

        vi.advanceTimersByTime(1000);

        const updatedAt = new Date();

        await task.update({ description: 'Read the spec' });

        vi.advanceTimersByTime(1000);

        const documentUrl = task.requireDocumentUrl();
        const freshTask = await HistoryTask.findOrFail(task.url);

        // Act
        const migrated = await freshTask.migrateSchema(HistoryTaskICalSchema);

        // Assert
        const quads = await documentQuads(documentUrl);
        const operations = required(migrated.operations) as PropertyOperation[];
        const operationsSummary = operations
            .map((operation) => ({
                resourceUrl: operation.resourceUrl,
                property: operation.property,
                date: operation.date,
                value: operation instanceof SetPropertyOperation ? operation.value : null,
            }))
            .sort((a, b) => a.property.localeCompare(b.property));

        expect(migrated).toBeInstanceOf(HistoryTask);
        expect(migrated.url).toEqual(`${documentUrl}#task`);
        expect(migrated.name).toEqual('Learn Solid');
        expect(migrated.description).toEqual('Read the spec');
        expect(migrated.status).toEqual('NEEDS-ACTION');
        expect(migrated.getAttributes()).not.toHaveProperty('priority');
        expect(migrated.isDirty()).toBe(false);
        expect(migrated.createdAt).toEqual(createdAt);
        expect(migrated.updatedAt).toEqual(updatedAt);
        expect(migrated.metadata?.resourceUrl).toEqual(`${documentUrl}#task`);
        expect(migrated.getSourceDocumentUrl()).toEqual(documentUrl);

        expect(subjectStatements(quads, documentUrl)).toEqual({});
        expect(subjectStatements(quads, `${documentUrl}#task`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [`${ICAL}Vtodo`],
            [`${ICAL}summary`]: ['Learn Solid'],
            [`${ICAL}description`]: ['Read the spec'],
            [`${ICAL}status`]: ['NEEDS-ACTION'],
            [`${SCHEMA}description`]: ['Read the spec'],
        });

        expect(operationsSummary).toEqual([
            {
                resourceUrl: `${documentUrl}#task`,
                property: `${ICAL}description`,
                date: updatedAt,
                value: ['Read the spec'],
            },
            { resourceUrl: `${documentUrl}#task`, property: `${ICAL}status`, date: updatedAt, value: ['NEEDS-ACTION'] },
            { resourceUrl: `${documentUrl}#task`, property: `${ICAL}summary`, date: createdAt, value: ['Learn Solid'] },
            {
                resourceUrl: `${documentUrl}#task`,
                property: `${SCHEMA}description`,
                date: updatedAt,
                value: ['Read the spec'],
            },
        ]);

        // Existing operations keep their urls, which were derived from the old resource url.
        expect(operations.filter((operation) => operation.url?.startsWith(`${documentUrl}#operation-`))).toHaveLength(
            2,
        );
        expect(
            operations.filter((operation) => operation.url?.startsWith(`${documentUrl}#task-operation-`)),
        ).toHaveLength(2);
    });

    it('keeps separate histories for fields with multiple properties', async () => {
        // Arrange
        useFakeClock();

        class AliasedTask extends defineSchema(HistoryTask, {
            fields: { name: z.string().rdfProperties(['name', 'alternateName']) },
        }) {}

        const AliasedTaskICalSchema = defineSchema(HistoryTaskICalSchema, {
            fields: { name: z.string().rdfProperties(['summary', 'comment']) },
        });

        bootModels({ AliasedTask });

        const task = await AliasedTask.create({ name: 'Learn Solid' });

        vi.advanceTimersByTime(1000);
        await task.update({ name: 'Learn Solid Pods' });

        const freshTask = await AliasedTask.findOrFail(task.url);
        const existingOperations = (await freshTask.loadRelation('operations')) as PropertyOperation[];

        // Act
        const migrated = await freshTask.migrateSchema(AliasedTaskICalSchema);

        // Assert
        const operations = required(migrated.operations) as SetPropertyOperation[];
        const propertyOperations = (property: string) =>
            operations
                .filter((operation) => operation.property === property)
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map((operation) => ({ url: operation.url, value: operation.value }));
        const existingUrl = (property: string, value: string) =>
            existingOperations.find(
                (operation) =>
                    operation.property === property && (operation as SetPropertyOperation).value[0] === value,
            )?.url;

        expect(propertyOperations(`${ICAL}summary`)).toEqual([
            { url: existingUrl(`${SCHEMA}name`, 'Learn Solid'), value: ['Learn Solid'] },
            { url: existingUrl(`${SCHEMA}name`, 'Learn Solid Pods'), value: ['Learn Solid Pods'] },
        ]);
        expect(propertyOperations(`${ICAL}comment`)).toEqual([
            { url: existingUrl(`${SCHEMA}alternateName`, 'Learn Solid'), value: ['Learn Solid'] },
            { url: existingUrl(`${SCHEMA}alternateName`, 'Learn Solid Pods'), value: ['Learn Solid Pods'] },
        ]);
    });

    it('replaces operations that would tie with new ones', async () => {
        // Arrange
        useFakeClock();

        const CapitalizedSchema = defineSchema(HistoryTaskICalSchema, {
            hooks: {
                beforeInitialize(attributes) {
                    attributes.status ??= 'NEEDS-ACTION';
                    attributes.name = String(attributes.name).replace(/\b\w/g, (letter) => letter.toUpperCase());
                },
            },
        });
        const task = await HistoryTask.create({ name: 'Learn solid' });

        vi.advanceTimersByTime(1000);

        const updatedAt = new Date();

        await task.update({ name: 'learn solid' });

        const freshTask = await HistoryTask.findOrFail(task.url);
        const existingOperations = (await freshTask.loadRelation('operations')) as PropertyOperation[];

        // Act
        const migrated = await freshTask.migrateSchema(CapitalizedSchema);

        // Assert
        const nameOperations = (required(migrated.operations) as SetPropertyOperation[])
            .filter((operation) => operation.property === `${ICAL}summary`)
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        expect(migrated.name).toEqual('Learn Solid');
        expect(nameOperations).toHaveLength(2);
        expect(nameOperations.map((operation) => operation.value)).toEqual([['Learn solid'], ['Learn Solid']]);
        expect(nameOperations[1]?.date).toEqual(updatedAt);
        expect(existingOperations.map((operation) => operation.url)).toContain(nameOperations[1]?.url);
    });

    it('produces the same document when migrating copies separately', async () => {
        // Arrange
        useFakeClock();

        const task = await HistoryTask.create({ name: 'Learn Solid', priority: 1 });

        vi.advanceTimersByTime(1000);
        await task.update({ description: 'Read the spec' });

        const documentUrl = task.requireDocumentUrl();
        const otherEngine = new InMemoryEngine();

        await otherEngine.createDocument(documentUrl, await documentQuads(documentUrl));

        // Act
        await (await HistoryTask.findOrFail(task.url)).migrateSchema(HistoryTaskICalSchema);

        vi.advanceTimersByTime(1000);
        setEngine(otherEngine);

        await (await HistoryTask.findOrFail(task.url)).migrateSchema(HistoryTaskICalSchema);

        // Assert
        const otherQuads = (await otherEngine.readDocument(documentUrl)).getQuads();

        expect(quadsToTurtle(otherQuads)).toEqualTurtle(quadsToTurtle(await documentQuads(documentUrl)));
    });

    it('migrates models without history', async () => {
        // Arrange
        const task = await Task.create({ name: 'Learn Solid', projectUrl: 'solid://projects/solid#it' });
        const documentUrl = task.requireDocumentUrl();

        // Act
        const migrated = await task.migrateSchema(TaskICalSchema);

        // Assert
        const quads = await documentQuads(documentUrl);

        expect(migrated).toBeInstanceOf(Task);
        expect(migrated.url).toEqual(`${documentUrl}#task`);
        expect(migrated.name).toEqual('Learn Solid');
        expect(migrated.projectUrl).toEqual('solid://projects/solid#it');
        expect(migrated.createdAt).toEqual(task.createdAt);
        expect(migrated.updatedAt).toEqual(task.updatedAt);

        expect(subjectStatements(quads, `${documentUrl}#it`)).toEqual({});
        expect(subjectStatements(quads, `${documentUrl}#task`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [`${ICAL}Vtodo`],
            [`${ICAL}summary`]: ['Learn Solid'],
            [`${ICAL}relatedTo`]: ['solid://projects/solid#it'],
        });
        expect(subjectStatements(quads, required(task.metadata?.url))).toMatchObject({
            'https://vocab.noeldemartin.com/crdt/resource': [`${documentUrl}#task`],
        });
    });

    it('moves legacy timestamps to metadata', async () => {
        // Arrange
        const documentUrl = 'solid://tasks/learn-solid';
        const quads = await turtleToQuads(`
            @prefix schema: <${SCHEMA}> .
            @prefix purl: <${PURL}> .
            @prefix xsd: <${XSD}> .

            <${documentUrl}#it>
                a schema:Action ;
                schema:name "Learn Solid" ;
                purl:created "2020-01-01T00:00:00.000Z"^^xsd:dateTime ;
                purl:modified "2020-01-02T00:00:00.000Z"^^xsd:dateTime .
        `);
        const TaskICalSameUrlSchema = defineSchema(TaskICalSchema, { rdfDefaultResourceHash: 'it' });

        await engine.createDocument(documentUrl, quads);

        const task = await Task.findOrFail(`${documentUrl}#it`);

        // Act
        const migrated = await task.migrateSchema(TaskICalSameUrlSchema);

        // Assert
        const migratedQuads = await documentQuads(documentUrl);

        expect(migrated.url).toEqual(`${documentUrl}#it`);
        expect(migrated.createdAt).toEqual(new Date('2020-01-01T00:00:00.000Z'));
        expect(migrated.updatedAt).toEqual(new Date('2020-01-02T00:00:00.000Z'));
        expect(migrated.metadata?.exists()).toBe(true);
        expect(subjectStatements(migratedQuads, `${documentUrl}#it`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [`${ICAL}Vtodo`],
            [`${ICAL}summary`]: ['Learn Solid'],
        });
        expect(subjectStatements(migratedQuads, `${documentUrl}#it-metadata`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': ['https://vocab.noeldemartin.com/crdt/Metadata'],
            'https://vocab.noeldemartin.com/crdt/resource': [`${documentUrl}#it`],
            'https://vocab.noeldemartin.com/crdt/createdAt': ['2020-01-01T00:00:00.000Z'],
            'https://vocab.noeldemartin.com/crdt/updatedAt': ['2020-01-02T00:00:00.000Z'],
        });
    });

    it('keeps unknown data when the url changes', async () => {
        // Arrange
        const documentUrl = 'solid://tasks/learn-solid';

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(`
                @prefix schema: <${SCHEMA}> .

                <${documentUrl}#it>
                    a schema:Action, schema:CreativeWork ;
                    schema:name "Learn Solid" ;
                    schema:keywords "solid", "learning" .
            `),
        );

        const task = await Task.findOrFail(`${documentUrl}#it`);

        // Act
        await task.migrateSchema(TaskICalSchema);

        // Assert
        const quads = await documentQuads(documentUrl);

        expect(subjectStatements(quads, `${documentUrl}#it`)).toEqual({});
        expect(subjectStatements(quads, `${documentUrl}#task`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [`${ICAL}Vtodo`, `${SCHEMA}CreativeWork`],
            [`${ICAL}summary`]: ['Learn Solid'],
            [`${SCHEMA}keywords`]: ['learning', 'solid'],
        });
    });

    it('keeps unknown data when the url does not change', async () => {
        // Arrange
        const documentUrl = 'solid://tasks/learn-solid';
        const TargetSchema = defineSchema(TaskICalSchema, {
            rdfDefaultResourceHash: 'it',
            fields: { priority: z.number().rdfProperty('priority').optional() },
        });

        await engine.createDocument(
            documentUrl,
            await turtleToQuads(`
                @prefix schema: <${SCHEMA}> .
                @prefix ical: <${ICAL}> .

                <${documentUrl}#it>
                    a schema:Action ;
                    schema:name "Learn Solid" ;
                    schema:keywords "solid" ;
                    ical:priority 1 .
            `),
        );

        const task = await Task.findOrFail(`${documentUrl}#it`);

        // Act
        const migrated = await task.migrateSchema(TargetSchema);

        // Assert
        const quads = await documentQuads(documentUrl);

        expect(migrated.priority).toEqual(1);
        expect(subjectStatements(quads, `${documentUrl}#it`)).toEqual({
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [`${ICAL}Vtodo`],
            [`${ICAL}summary`]: ['Learn Solid'],
            [`${ICAL}priority`]: ['1'],
            [`${SCHEMA}keywords`]: ['solid'],
        });
    });

    it('keeps operations for unknown properties', async () => {
        // Arrange
        useFakeClock();

        class TaskWithKeywords extends defineSchema(HistoryTask, {
            fields: { keywords: z.array(z.string()).default([]) },
        }) {}

        bootModels({ TaskWithKeywords });

        const taskWithKeywords = await TaskWithKeywords.create({ name: 'Learn Solid' });

        vi.advanceTimersByTime(1000);
        await taskWithKeywords.update({ keywords: ['solid'] });

        const documentUrl = taskWithKeywords.requireDocumentUrl();
        const task = await HistoryTask.findOrFail(taskWithKeywords.url);

        // Act
        const migrated = await task.migrateSchema(HistoryTaskICalSchema);

        // Assert
        const quads = await documentQuads(documentUrl);
        const keywordsOperations = (required(migrated.operations) as PropertyOperation[]).filter(
            (operation) => operation.property === `${SCHEMA}keywords`,
        );

        expect(subjectStatements(quads, `${documentUrl}#task`)).toMatchObject({ [`${SCHEMA}keywords`]: ['solid'] });
        expect(keywordsOperations).toHaveLength(1);
        expect(keywordsOperations[0]?.resourceUrl).toEqual(`${documentUrl}#task`);
    });

    it('keeps unchanged values with the Solid engine', async () => {
        // Arrange
        const documentUrl = 'https://alice.example/tasks/learn-solid';
        const turtle = `
            @prefix schema: <${SCHEMA}> .

            <#it> a schema:Action ; schema:name "Learn Solid" ; schema:object <../projects/solid#it> .
        `;
        const TargetSchema = defineSchema(Task, {
            rdfContexts: { ical: ICAL },
            rdfClasses: ['Action', 'ical:Vtodo'],
            fields: { name: z.string().rdfProperties(['name', 'ical:summary']) },
        });
        const RemoteTask = remote(Task);

        FakeServer.respondWith(documentUrl, (request) =>
            request.method === 'GET' ? FakeResponse.success(turtle) : FakeResponse.success(),
        );

        const task = await RemoteTask.findOrFail(`${documentUrl}#it`);

        // Act
        const migrated = await task.migrateSchema(TargetSchema);

        // Assert
        expect(migrated).toBeInstanceOf(RemoteTask);
        expect(migrated.url).toEqual(`${documentUrl}#it`);
        expect(FakeServer.getRequest('PATCH', documentUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix ical: <${ICAL}> .

                <#it> a ical:Vtodo ; ical:summary "Learn Solid" .
            }
        `);
    });

    it('fails with invalid attributes', async () => {
        // Arrange
        const RequiredSchema = defineSchema(TaskICalSchema, { fields: { priority: z.number() } });
        const task = await Task.create({ name: 'Learn Solid' });
        const turtle = quadsToTurtle(await documentQuads(task.requireDocumentUrl()));

        // Act & Assert
        await expect(task.migrateSchema(RequiredSchema)).rejects.toThrow(InvalidAttributesError);
        expect(quadsToTurtle(await documentQuads(task.requireDocumentUrl()))).toEqualTurtle(turtle);
    });

    it('reuses migrated models', async () => {
        // Arrange
        const first = await Task.create({ name: 'Learn Solid' });
        const second = await Task.create({ name: 'Write docs' });

        // Act
        const firstMigrated = await first.migrateSchema(TaskICalSchema);
        const secondMigrated = await second.migrateSchema(TaskICalSchema);

        bootModels({ Task }, { reset: true });

        const third = await Task.create({ name: 'Publish' });
        const thirdMigrated = await third.migrateSchema(TaskICalSchema);

        // Assert
        expect(firstMigrated.static()).toBe(secondMigrated.static());
        expect(thirdMigrated.static()).not.toBe(firstMigrated.static());
    });
});

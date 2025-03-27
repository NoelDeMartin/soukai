import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { FieldType, InMemoryEngine, bootModels, setEngine } from 'soukai';
import { toString } from '@noeldemartin/utils';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

import SchemaTaskSchema from 'soukai-solid/testing/lib/stubs/SchemaTask.schema';
import ICalTaskSchema, { ICAL_TASK_FIELDS } from 'soukai-solid/testing/lib/stubs/ICalTask.schema';

class Task extends SchemaTaskSchema {}

describe('Solid Schema Migrations', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();

        setEngine(engine);
        bootModels({ Task });
    });

    it('changes urls when migrating schemas', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const task = await Task.create({
            url: documentUrl,
            name: 'Initial name',
            status: 'https://schema.org/PotentialActionStatus',
            completedAt: new Date(),
        });

        await task.update({ name: 'Updated name' });

        // Act
        const migrated = await task.migrateSchema(
            defineSolidModelSchema(ICalTaskSchema, {
                fields: {
                    ...ICAL_TASK_FIELDS,
                    description: {
                        type: FieldType.String,
                        alias: 'name',
                    },
                },
                hooks: {
                    beforeSave() {
                        this.setAttribute('priority', 1);
                    },
                },
            }),
        );

        // Assert
        expect(migrated.url).toEqual(`${documentUrl}#it`);
        expect(migrated.name).toEqual('Updated name');
        expect(migrated.description).toEqual('Updated name');
        expect(migrated.priority).toEqual(1);
        expect(migrated.operations).toHaveLength(5);

        const document = (await engine.readOne(containerUrl, documentUrl)) as JsonLDGraph;
        const taskResource = document['@graph'].find((resource) => resource['@id'] === `${documentUrl}#it`);
        const metadataResource = document['@graph'].find((resource) => resource['@id'] === `${documentUrl}#metadata`);
        const existingOperationResources = document['@graph'].filter((resource) => {
            return (
                resource['@id'].startsWith(`${documentUrl}#operation`) &&
                toString(resource['@type']).endsWith('Operation')
            );
        });
        const newOperationResources = document['@graph'].filter((resource) => {
            return (
                resource['@id'].startsWith(`${documentUrl}#it-operation`) &&
                toString(resource['@type']).endsWith('Operation')
            );
        });

        expect(document['@graph']).toHaveLength(7);

        expect(taskResource).toEqual({
            '@context': { '@vocab': 'http://www.w3.org/2002/12/cal/ical#' },
            '@type': 'Vtodo',
            '@id': `${documentUrl}#it`,
            'summary': 'Updated name',
            'description': 'Updated name',
            'priority': 1,
            'completed': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.completedAt?.toISOString(),
            },
        });

        expect(metadataResource).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'Metadata',
            '@id': `${documentUrl}#metadata`,
            'resource': { '@id': `${documentUrl}#it` },
            'createdAt': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.createdAt?.toISOString(),
            },
            'updatedAt': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.updatedAt?.toISOString(),
            },
        });

        expect(existingOperationResources[0]).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'SetPropertyOperation',
            '@id': task.operations[0]?.url,
            'resource': { '@id': `${documentUrl}#it` },
            'property': { '@id': 'http://www.w3.org/2002/12/cal/ical#summary' },
            'value': 'Initial name',
            'date': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.createdAt?.toISOString(),
            },
        });

        expect(existingOperationResources[1]).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'SetPropertyOperation',
            '@id': task.operations[2]?.url,
            'resource': { '@id': `${documentUrl}#it` },
            'property': { '@id': 'http://www.w3.org/2002/12/cal/ical#completed' },
            'value': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.completedAt?.toISOString(),
            },
            'date': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.createdAt?.toISOString(),
            },
        });

        expect(existingOperationResources[2]).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'SetPropertyOperation',
            '@id': task.operations[3]?.url,
            'resource': { '@id': `${documentUrl}#it` },
            'property': { '@id': 'http://www.w3.org/2002/12/cal/ical#summary' },
            'value': 'Updated name',
            'date': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.updatedAt?.toISOString(),
            },
        });

        expect(newOperationResources[0]).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'SetPropertyOperation',
            '@id': newOperationResources[0]?.['@id'],
            'resource': { '@id': `${documentUrl}#it` },
            'property': { '@id': 'http://www.w3.org/2002/12/cal/ical#description' },
            'value': 'Updated name',
            'date': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.updatedAt?.toISOString(),
            },
        });

        expect(newOperationResources[1]).toEqual({
            '@context': { '@vocab': 'https://vocab.noeldemartin.com/crdt/' },
            '@type': 'SetPropertyOperation',
            '@id': newOperationResources[1]?.['@id'],
            'resource': { '@id': `${documentUrl}#it` },
            'property': { '@id': 'http://www.w3.org/2002/12/cal/ical#priority' },
            'value': 1,
            'date': {
                '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                '@value': task.updatedAt?.toISOString(),
            },
        });
    });

});

import { expandIRI } from '@noeldemartin/solid-utils';
import { fakeDocumentUrl } from '@noeldemartin/testing';
import type { Quad } from '@rdfjs/types';
import { CRDT_VALUE, serializeTerm } from 'soukai-bis/lib/internals/rdf';
import { syncDocumentOperations } from 'soukai-bis/models/concerns/crdts';
import { isPropertyOperation } from 'soukai-bis/models/crdts/helpers';
import { ICAL, SCHEMA } from 'soukai-bis/testing/constants';
import TaskWithCasts from 'soukai-bis/testing/stubs/TaskWithCasts';
import { STATUS_COMPLETED, STATUS_POTENTIAL } from 'soukai-bis/testing/stubs/TaskWithCasts.schema';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it, vi } from 'vite-plus/test';
import z from 'zod';

import type PropertyOperation from './crdts/PropertyOperation';
import type ValuePropertyOperation from './crdts/ValuePropertyOperation';
import { bootModels } from './registry';
import { defineSchema } from './schema';

describe('Model RDF casts', () => {
    it('serializes and deserializes values', async () => {
        // Arrange
        const task = await TaskWithCasts.create({
            name: 'Write docs',
            completed: true,
            priority: 'medium',
            tags: ['b', 'a', 'b'],
        });

        // Act
        const freshTask = await TaskWithCasts.findOrFail(task.url);

        // Assert
        const document = await engine.readDocument(task.requireDocumentUrl());

        expect(objects(document.statements(task.url, `${SCHEMA}actionStatus`))).toEqual([`<${STATUS_COMPLETED}>`]);
        expect(objects(document.statements(task.url, `${ICAL}priority`))).toEqual([
            `"5"^^<${expandIRI('xsd:integer')}>`,
        ]);
        expect(objects(document.statements(task.url, `${SCHEMA}keywords`))).toEqual([
            `"a,b"^^<${expandIRI('xsd:string')}>`,
        ]);

        expect(freshTask.completed).toBe(true);
        expect(freshTask.priority).toBe('medium');
        expect(freshTask.tags).toEqual(['a', 'b']);
        expect(freshTask.isDirty()).toBe(false);
    });

    it('reads data written by other applications', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();
        const url = `${documentUrl}#it`;

        await engine.createDocument(documentUrl, {
            '@id': url,
            '@type': `${SCHEMA}Action`,
            [`${SCHEMA}name`]: 'Write docs',
            [`${SCHEMA}actionStatus`]: { '@id': STATUS_POTENTIAL },
            [`${ICAL}priority`]: 3,
        });

        // Act
        const task = await TaskWithCasts.findOrFail(url);

        // Assert
        expect(task.completed).toBe(false);
        expect(task.priority).toBe('high');
        expect(task.tags).toEqual([]);
    });

    it('records serialized values in history', async () => {
        // Arrange
        const task = await TaskWithCasts.create({
            name: 'Write docs',
            completed: false,
            priority: 'low',
            tags: ['a'],
        });

        // Act
        const updateDocumentSpy = vi.spyOn(engine, 'updateDocument');

        vi.advanceTimersByTime(1);
        await task.update({ completed: true, priority: 'high', tags: ['a', 'c'] });

        // Assert
        const document = await engine.readDocument(task.requireDocumentUrl());
        const freshTask = await TaskWithCasts.findOrFail(task.url);
        const inceptionValues = objects(document.statements(undefined, CRDT_VALUE));
        const updateOperations = (updateDocumentSpy.mock.calls[0]?.[1] ?? [])
            .filter((operation) => isPropertyOperation(operation) && operation.resourceUrl === task.url)
            .map((operation) => [
                (operation as PropertyOperation).static().modelName,
                (operation as PropertyOperation).property,
                (operation as ValuePropertyOperation).values.map(serializeTerm),
            ]);

        expect(inceptionValues).toEqual(
            expect.arrayContaining([
                `<${STATUS_POTENTIAL}>`,
                `"9"^^<${expandIRI('xsd:integer')}>`,
                `"a"^^<${expandIRI('xsd:string')}>`,
            ]),
        );
        expect(updateOperations).toEqual(
            expect.arrayContaining([
                ['SetPropertyOperation', `${SCHEMA}actionStatus`, [`<${STATUS_COMPLETED}>`]],
                ['SetPropertyOperation', `${ICAL}priority`, [`"1"^^<${expandIRI('xsd:integer')}>`]],
                ['AddPropertyOperation', `${SCHEMA}keywords`, [`"a,c"^^<${expandIRI('xsd:string')}>`]],
                ['RemovePropertyOperation', `${SCHEMA}keywords`, [`"a"^^<${expandIRI('xsd:string')}>`]],
            ]),
        );
        expect(updateOperations).toHaveLength(4);
        expect(objects(document.statements(task.url, `${SCHEMA}keywords`))).toEqual([
            `"a,c"^^<${expandIRI('xsd:string')}>`,
        ]);
        expect(await syncDocumentOperations(task.requireDocumentUrl())).toEqual({ updated: [] });
        expect(freshTask.completed).toBe(true);
        expect(freshTask.priority).toBe('high');
        expect(freshTask.tags).toEqual(['a', 'c']);
    });

    it('keeps rdf types for wrapped fields', async () => {
        // Arrange
        const Event = defineSchema({
            rdfContext: SCHEMA,
            rdfClass: 'Event',
            timestamps: false,
            fields: {
                startDate: z.date().optional().catch(undefined),
                attendees: z.preprocess((value) => value, z.number()).optional(),
            },
        });

        bootModels({ Event });

        // Act
        const event = await Event.create({ startDate: new Date('2025-01-01T00:00:00Z'), attendees: 42 });

        // Assert
        const document = await engine.readDocument(event.requireDocumentUrl());

        expect(objects(document.statements(event.url, `${SCHEMA}startDate`))).toEqual([
            `"2025-01-01T00:00:00.000Z"^^<${expandIRI('xsd:dateTime')}>`,
        ]);
        expect(objects(document.statements(event.url, `${SCHEMA}attendees`))).toEqual([
            `"42"^^<${expandIRI('xsd:integer')}>`,
        ]);
    });

    it('unsets properties when a custom serializer returns nothing', async () => {
        // Arrange
        const Item = defineSchema({
            rdfContext: SCHEMA,
            rdfClass: 'Thing',
            history: true,
            fields: {
                label: z
                    .string()
                    .default('')
                    .rdfCast({
                        serialize: (value) => value || undefined,
                        deserialize: ([value]) => value ?? '',
                    }),
            },
        });

        bootModels({ Item });

        const item = await Item.create({ label: 'Initial' });

        // Act
        vi.advanceTimersByTime(1);
        await item.update({ label: '' });

        // Assert
        const document = await engine.readDocument(item.requireDocumentUrl());
        const freshItem = await Item.findOrFail(item.url);

        expect(document.statements(item.url, `${SCHEMA}label`)).toEqual([]);
        expect(freshItem.label).toBe('');
    });

    function objects(quads: Quad[] | Quad | null): string[] {
        return [quads ?? []].flat().map((quad) => serializeTerm(quad.object));
    }
});

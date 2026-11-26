import { expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import { required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import Project from 'soukai-bis/testing/stubs/Project';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import z from 'zod';

import type PropertyOperation from './crdts/PropertyOperation';
import { bootModels } from './registry';
import { remote } from './remote';
import { defineSchema } from './schema';
import TodoWithHooks from './testing/stubs/TodoWithHooks';
import TodoWithHooksSchema from './testing/stubs/TodoWithHooks.schema';

describe('Model hooks', () => {
    it('fills in attributes before validating', () => {
        // Act
        // @ts-expect-error The name is filled in by the hook.
        const todo = new TodoWithHooks({ description: 'Learn Solid' });

        // Assert
        expect(todo.name).toEqual('Learn Solid');
        expect(todo.isDirty('name')).toBe(true);
    });

    it('receives the source quads in beforeInitialize', async () => {
        // Arrange
        const beforeInitialize = vi.fn();
        const Schema = defineSchema(TodoWithHooksSchema, { hooks: { beforeInitialize } });
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .

            <solid://todos/learn-solid#it> a schema:Action ; schema:name "Learn Solid" .
        `);

        class SpiedTodo extends Schema {}

        bootModels({ SpiedTodo });

        // Act
        await SpiedTodo.fromRDF(quads).find('solid://todos/learn-solid#it');
        new SpiedTodo({ name: 'Write docs' });

        // Assert
        expect(beforeInitialize).toHaveBeenCalledTimes(2);
        expect(beforeInitialize.mock.calls[0]?.[0]).toMatchObject({ name: 'Learn Solid' });
        expect(beforeInitialize.mock.calls[0]?.[1]).toEqual({ quads });
        expect(beforeInitialize.mock.calls[1]?.[1]).toEqual({ quads: undefined });
    });

    it('does not run beforeInitialize when hydrating', async () => {
        // Arrange
        const todo = await TodoWithHooks.create({ name: 'Learn Solid' });
        const serialized = todo.serialize();
        const beforeInitialize = vi.fn();
        const Schema = defineSchema(TodoWithHooksSchema, { hooks: { beforeInitialize } });

        await TodoWithHooks.updateSchema(Schema);

        // Act
        const hydrated = await TodoWithHooks.hydrate(serialized);

        // Assert
        expect(hydrated.name).toEqual('Learn Solid');
        expect(beforeInitialize).not.toHaveBeenCalled();
    });

    it('does not write filled in attributes until they are edited', async () => {
        // Arrange

        const documentUrl = 'solid://todos/learn-solid';
        const url = `${documentUrl}#it`;
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .

            <${url}> a schema:Action ; schema:description "Learn Solid" .
        `);

        await engine.createDocument(documentUrl, quads);

        // Act
        const todo = required(await TodoWithHooks.fromRDF(quads).find(url));
        const serialized = todo.serialize();

        vi.advanceTimersByTime(1000);
        await todo.update({ completedAt: new Date() });

        // Assert
        const statements = await documentStatements(engine, documentUrl);
        const operations = await loadOperations(url);
        const operationProperties = operations.map((operation) => operation.property).sort();

        expect(todo.name).toEqual('Learn Solid');
        expect(serialized.nodes[0]?.staleRDFProperties).toEqual(['https://schema.org/name']);
        expect(statements.some((quad) => quad.predicate.value === 'https://schema.org/name')).toBe(false);
        expect(operationProperties).toEqual([
            expandIRI('schema:actionStatus'),
            'https://schema.org/description',
            'https://schema.org/endTime',
        ]);

        // Act
        await todo.update({ name: 'Learn Solid (again)' });

        // Assert
        const updatedStatements = await documentStatements(engine, documentUrl);

        expect(
            updatedStatements.find((quad) => quad.predicate.value === 'https://schema.org/name')?.object.value,
        ).toEqual('Learn Solid (again)');
    });

    it('detects attributes modified in place', async () => {
        // Arrange
        const Schema = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Action',
            fields: {
                name: z.string(),
                keywords: z.array(z.string()).default([]),
            },
            hooks: {
                beforeInitialize(attributes) {
                    (attributes.keywords as string[] | undefined)?.push('todo');
                },
            },
        });
        const url = 'solid://todos/learn-solid#it';
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .

            <${url}> a schema:Action ; schema:name "Learn Solid" ; schema:keywords "solid" .
        `);
        const keywords = ['docs'];

        class TaggedTodo extends Schema {}

        bootModels({ TaggedTodo });

        // Act
        const todo = required(await TaggedTodo.fromRDF(quads).find(url));
        const newTodo = new TaggedTodo({ name: 'Write docs', keywords });

        // Assert
        expect(todo.keywords).toEqual(['solid', 'todo']);
        expect(todo.serialize().nodes[0]?.staleRDFProperties).toEqual(['https://schema.org/keywords']);
        expect(newTodo.keywords).toEqual(['docs', 'todo']);
        expect(keywords).toEqual(['docs']);
    });

    it('restores stale RDF properties when hydrating', async () => {
        // Arrange
        const documentUrl = 'solid://todos/learn-solid';
        const url = `${documentUrl}#it`;
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .

            <${url}> a schema:Action ; schema:description "Learn Solid" .
        `);

        await engine.createDocument(documentUrl, quads);

        const todo = required(await TodoWithHooks.fromRDF(quads).find(url));

        // Act
        const hydrated = await TodoWithHooks.hydrate(todo.serialize());

        await hydrated.update({ completedAt: new Date() });

        // Assert
        const operations = await loadOperations(url);

        expect(operations.map((operation) => operation.property)).not.toContain('https://schema.org/name');
    });

    it('derives attributes when saving', async () => {
        // Act
        const todo = await TodoWithHooks.create({ name: 'Learn Solid' });

        // Assert
        expect(todo.status).toEqual(expandIRI('schema:PotentialActionStatus'));

        // Act
        await todo.update({ completedAt: new Date() });

        // Assert
        const freshTodo = await TodoWithHooks.findOrFail(todo.url);

        expect(freshTodo.status).toEqual(expandIRI('schema:CompletedActionStatus'));
    });

    it('records changes in the same history batch', async () => {
        // Arrange

        const todo = await TodoWithHooks.create({ name: 'Learn Solid' });

        // Act
        vi.advanceTimersByTime(1000);
        await todo.update({ completedAt: new Date() });

        // Assert
        const freshTodo = await TodoWithHooks.findOrFail(todo.url);
        const operations = await loadOperations(freshTodo.url);
        const statusOperations = operations
            .filter((operation) => operation.property === expandIRI('schema:actionStatus'))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        const completedAtOperation = required(
            operations.find((operation) => operation.property === 'https://schema.org/endTime'),
        );

        expect(statusOperations).toHaveLength(2);
        expect(statusOperations[1]?.date).toEqual(completedAtOperation.date);
    });

    it('does not create redundant operations', async () => {
        // Arrange

        const todo = await TodoWithHooks.create({ name: 'Learn Solid' });

        // Act
        vi.advanceTimersByTime(1000);
        await todo.update({ name: 'Learn Solid (again)' });

        // Assert
        const freshTodo = await TodoWithHooks.findOrFail(todo.url);
        const operations = await loadOperations(freshTodo.url);

        expect(operations.filter((operation) => operation.property === expandIRI('schema:actionStatus'))).toHaveLength(
            1,
        );
    });

    it('runs beforeSave for dirty models in the same document', async () => {
        // Arrange
        const beforeSave = vi.fn();
        const Schema = defineSchema(TaskICalSchema, { hooks: { beforeSave } });

        await Task.updateSchema(Schema);

        const project = new Project({ name: 'Solid' });
        const task = project.relatedTasks.attach({ name: 'Learn Solid' });

        const { url } = await project.save();
        const freshProject = await Project.findOrFail(url);
        const [freshTask, deletedTask] = [
            required(freshProject.tasks?.[0]),
            freshProject.relatedTasks.attach({ name: 'Delete me' }),
        ];

        await freshProject.save();

        beforeSave.mockClear();
        deletedTask.markForDeletion();
        freshTask.name = 'Learn Solid (again)';

        // Act
        await freshProject.save();

        // Assert
        expect(task.exists()).toBe(true);
        expect(beforeSave).toHaveBeenCalledTimes(1);
        expect(beforeSave.mock.contexts[0]).toBe(freshTask);
    });

    it('does not run beforeSave on clean models', async () => {
        // Arrange
        const beforeSave = vi.fn();
        const Schema = defineSchema(TaskICalSchema, { hooks: { beforeSave } });

        await Task.updateSchema(Schema);

        const task = await Task.create({ name: 'Learn Solid' });

        // Act
        await task.save();

        // Assert
        expect(beforeSave).toHaveBeenCalledTimes(1);
    });

    it('merges hooks when extending schemas', () => {
        // Arrange
        const beforeSave = vi.fn();
        const Schema = defineSchema(TodoWithHooksSchema, { hooks: { beforeSave } });

        class ExtendedTodo extends Schema {}

        bootModels({ ExtendedTodo });

        // Act
        // @ts-expect-error The name is filled in by the hook.
        const todo = new ExtendedTodo({ description: 'Learn Solid' });

        // Assert
        expect(todo.name).toEqual('Learn Solid');
    });

    it('swaps hooks when updating schemas', async () => {
        // Arrange
        const NoHooksSchema = defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'Action',
            history: true,
            fields: {
                name: z.string().optional(),
                description: z.string().optional(),
                status: z.string().rdfProperty('actionStatus').optional(),
                completedAt: z.date().rdfProperty('endTime').optional(),
            },
        });

        // Act
        await TodoWithHooks.updateSchema(NoHooksSchema);

        // Assert
        // @ts-expect-error The name is optional in the new schema.
        const todo = await TodoWithHooks.create({ description: 'Learn Solid' });

        expect(todo.name).toBeUndefined();
        expect(todo.status).toBeUndefined();
    });

    it('uses hooks in remote models', async () => {
        // Arrange
        // @ts-expect-error The name is filled in by the hook.
        const todo = new (remote(TodoWithHooks))({ description: 'Learn Solid' });

        // Assert
        expect(todo.name).toEqual('Learn Solid');
    });

    it('types hooks', () => {
        defineSchema({
            fields: { name: z.string(), description: z.string().optional() },
            hooks: {
                beforeInitialize(attributes) {
                    expectTypeOf(attributes.name).toEqualTypeOf<string | undefined>();
                },
                beforeSave() {
                    expectTypeOf(this.name).toEqualTypeOf<string>();
                    expectTypeOf(this.description).toEqualTypeOf<string | undefined>();
                },
            },
        });
    });

    async function loadOperations(url: string): Promise<PropertyOperation[]> {
        const todo = await TodoWithHooks.findOrFail(url);

        return (await todo.loadRelation('operations')) as PropertyOperation[];
    }

    function documentStatements(engine: InMemoryEngine, documentUrl: string): Promise<Quad[]> {
        return engine.readDocument(documentUrl).then((document) => document.getQuads());
    }
});

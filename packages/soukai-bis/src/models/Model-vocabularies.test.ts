import { expandIRI, turtleToQuads } from '@noeldemartin/solid-utils';
import { invade, required } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import { ICAL } from 'soukai-bis/testing/constants';
import Todo from 'soukai-bis/testing/stubs/Todo';
import TodoSchema from 'soukai-bis/testing/stubs/Todo.schema';
import { engine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it, vi } from 'vite-plus/test';
import z from 'zod';

import type PropertyOperation from './crdts/PropertyOperation';
import { allOf } from './matching/fluent';
import { bootModels } from './registry';
import { defineSchema } from './schema';

describe('Model vocabularies', () => {
    it('matches resources with any of the RDF classes', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <solid://tasks#one> a schema:Action ; schema:name "One" .
            <solid://tasks#two> a ical:Vtodo ; ical:summary "Two" .
            <solid://tasks#three> a schema:Action, ical:Vtodo ; schema:name "Three" .
            <solid://tasks#four> a schema:Event ; schema:name "Four" .
        `);

        // Act
        const tasks = await Todo.fromRDF(quads).all();
        const four = await Todo.fromRDF(quads).find('solid://tasks#four');

        // Assert
        expect(tasks.map((task) => task.name).sort()).toEqual(['One', 'Three', 'Two']);
        expect(four).toBeNull();
    });

    it('matches resources with all of the RDF classes', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <solid://tasks#one> a schema:Action ; schema:name "One" .
            <solid://tasks#two> a schema:Action, ical:Vtodo ; schema:name "Two" .
        `);

        for (const rdfClasses of [['Action', 'ical:Vtodo'], allOf(['Action', 'ical:Vtodo'])]) {
            const Schema = defineSchema(TodoSchema, { rdfClasses });

            await Todo.updateSchema(Schema);

            // Act
            const tasks = await Todo.fromRDF(quads).all();

            // Assert
            expect(tasks.map((task) => task.name)).toEqual(['Two']);
            expect(Todo.matchesRDFClasses([expandIRI('schema:Action')])).toBe(false);
        }
    });

    it('writes all the RDF classes', async () => {
        // Act
        const task = await Todo.create({ name: 'Learn Solid' });

        // Assert
        const document = await engine.readDocument(task.requireDocumentUrl());
        const types = document
            .statements(task.url, 'rdf:type')
            .map((statement) => statement.object.value)
            .sort();

        expect(Todo.getRDFClasses()).toEqual([expandIRI('schema:Action'), `${ICAL}Vtodo`]);
        expect(types).toEqual([`${ICAL}Vtodo`, expandIRI('schema:Action')]);
    });

    it('inherits RDF classes rules from parent schemas', () => {
        // Arrange
        const Schema = defineSchema(TodoSchema, { fields: { description: z.string().optional() } });

        class ExtendedTodo extends Schema {}

        bootModels({ ExtendedTodo });

        // Act & Assert
        expect(ExtendedTodo.matchesRDFClasses([`${ICAL}Vtodo`])).toBe(true);
        expect(ExtendedTodo.getRDFClasses()).toEqual(Todo.getRDFClasses());
    });

    it('reads values from the first property with values', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <solid://tasks#one> a ical:Vtodo ; ical:summary "One" .
            <solid://tasks#two> a schema:Action ; schema:name "Two" ; ical:summary "Old name" .
        `);

        // Act
        const one = required(await Todo.fromRDF(quads).find('solid://tasks#one'));
        const two = required(await Todo.fromRDF(quads).find('solid://tasks#two'));

        // Assert
        expect(one.name).toEqual('One');
        expect(two.name).toEqual('Two');
        expect(one.isDirty()).toBe(false);
        expect(two.isDirty()).toBe(false);
        expect(one.getAttributes()).not.toHaveProperty('summary');
    });

    it('writes values to all the properties', async () => {
        // Arrange

        // Act
        const task = await Todo.create({ name: 'Learn Solid', completedAt: new Date() });

        vi.advanceTimersByTime(1000);
        await task.update({ name: 'Learn Solid (again)' });

        // Assert
        const quads = (await engine.readDocument(task.requireDocumentUrl())).getQuads();
        const operations = await loadOperations(task.url);
        const countOperations = (property: string) =>
            operations.filter((operation) => operation.property === property).length;

        expect(predicateValues(quads, expandIRI('schema:name'))).toEqual(['Learn Solid (again)']);
        expect(predicateValues(quads, `${ICAL}summary`)).toEqual(['Learn Solid (again)']);
        expect(predicateValues(quads, expandIRI('schema:endTime'))).toHaveLength(1);
        expect(predicateValues(quads, `${ICAL}completed`)).toHaveLength(1);
        expect(countOperations(expandIRI('schema:name'))).toEqual(2);
        expect(countOperations(`${ICAL}summary`)).toEqual(2);
        expect(countOperations(expandIRI('schema:endTime'))).toEqual(1);
        expect(countOperations(`${ICAL}completed`)).toEqual(1);
    });

    it('does not upgrade resources until fields are edited', async () => {
        // Arrange

        const documentUrl = 'solid://tasks/learn-solid';
        const url = `${documentUrl}#it`;
        const quads = await turtleToQuads(`
            @prefix ical: <${ICAL}> .

            <${url}> a ical:Vtodo ; ical:summary "Learn Solid" .
        `);

        await engine.createDocument(documentUrl, quads);

        const task = required(await Todo.fromRDF(quads).find(url));

        // Act
        vi.advanceTimersByTime(1000);
        await task.update({ priority: '1' });

        // Assert
        const firstQuads = (await engine.readDocument(documentUrl)).getQuads();
        const firstOperations = await loadOperations(url);

        expect(predicateValues(firstQuads, expandIRI('schema:name'))).toEqual([]);
        expect(
            predicateValues(
                firstQuads.filter((quad) => quad.subject.value === url),
                'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
            ),
        ).toEqual([`${ICAL}Vtodo`]);
        expect(firstOperations.map((operation) => operation.property).sort()).toEqual([
            `${ICAL}priority`,
            `${ICAL}summary`,
        ]);

        // Act
        vi.advanceTimersByTime(1000);
        await task.update({ name: 'Learn Solid (again)' });

        // Assert
        const secondQuads = (await engine.readDocument(documentUrl)).getQuads();
        const secondOperations = await loadOperations(url);

        expect(predicateValues(secondQuads, expandIRI('schema:name'))).toEqual(['Learn Solid (again)']);
        expect(predicateValues(secondQuads, `${ICAL}summary`)).toEqual(['Learn Solid (again)']);
        expect(secondOperations.filter((operation) => operation.property === expandIRI('schema:name'))).toHaveLength(1);
        expect(secondOperations.filter((operation) => operation.property === `${ICAL}summary`)).toHaveLength(2);
    });

    it('does not record stale properties in inception operations', async () => {
        // Arrange
        const documentUrl = 'solid://tasks/learn-solid';
        const url = `${documentUrl}#it`;
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <${url}> a schema:Action, ical:Vtodo ; schema:name "Learn Solid" ; ical:summary "Old name" .
        `);

        await engine.createDocument(documentUrl, quads);

        const task = required(await Todo.fromRDF(quads).find(url));

        // Act
        await task.update({ priority: '1' });

        // Assert
        const updatedQuads = (await engine.readDocument(documentUrl)).getQuads();
        const operations = await loadOperations(url);

        expect(predicateValues(updatedQuads, `${ICAL}summary`)).toEqual(['Old name']);
        expect(operations.map((operation) => operation.property).sort()).toEqual([
            `${ICAL}priority`,
            expandIRI('schema:name'),
        ]);
    });

    it('only keeps stale RDF properties when there are any', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <solid://todos#one> a ical:Vtodo ; ical:summary "One" .
            <solid://todos#two> a schema:Action, ical:Vtodo ; schema:name "Two" ; ical:summary "Two" .
        `);
        const staleRDFProperties = (todo: Todo) => invade(todo, ['_staleRDFProperties'])._staleRDFProperties;

        // Act
        const one = required(await Todo.fromRDF(quads).find('solid://todos#one'));
        const two = required(await Todo.fromRDF(quads).find('solid://todos#two'));
        const three = new Todo({ name: 'Three' });

        // Assert
        expect(staleRDFProperties(one)).toEqual(new Set([expandIRI('schema:name')]));
        expect(staleRDFProperties(two)).toBeNull();
        expect(staleRDFProperties(three)).toBeNull();

        // Act
        one.name = 'One (again)';

        // Assert
        expect(staleRDFProperties(one)).toBeNull();
    });

    it('ignores the order of values when detecting stale RDF properties', async () => {
        // Arrange
        const TaggedTodoSchema = defineSchema(TodoSchema, {
            fields: { keywords: z.array(z.string()).rdfProperties(['keywords', 'ical:categories']).optional() },
        });

        class TaggedTodo extends TaggedTodoSchema {}

        bootModels({ TaggedTodo });

        const quads = await turtleToQuads(`
            @prefix schema: <https://schema.org/> .
            @prefix ical: <${ICAL}> .

            <solid://todos#one>
                a schema:Action ;
                schema:name "One" ;
                ical:summary "One" ;
                schema:keywords "solid", "todo" ;
                ical:categories "todo", "solid" .
        `);

        // Act
        const todo = required(await TaggedTodo.fromRDF(quads).find('solid://todos#one'));

        // Assert
        expect(todo.keywords).toEqual(['solid', 'todo']);
        expect(invade(todo, ['_staleRDFProperties'])._staleRDFProperties).toBeNull();
    });

    it('keeps stale RDF properties when hydrating', async () => {
        // Arrange
        const documentUrl = 'solid://tasks/learn-solid';
        const url = `${documentUrl}#it`;
        const quads = await turtleToQuads(`
            @prefix ical: <${ICAL}> .

            <${url}> a ical:Vtodo ; ical:summary "Learn Solid" .
        `);

        await engine.createDocument(documentUrl, quads);

        const task = required(await Todo.fromRDF(quads).find(url));

        // Act
        const hydrated = await Todo.hydrate(task.serialize());

        await hydrated.update({ priority: '1' });

        // Assert
        const operations = await loadOperations(url);

        expect(operations.map((operation) => operation.property)).not.toContain(expandIRI('schema:name'));
    });

    it('inherits and swaps RDF properties', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix ical: <${ICAL}> .

            <solid://tasks#it> a ical:Vtodo ; ical:summary "Learn Solid" .
        `);
        const ExtendedSchema = defineSchema(TodoSchema, { fields: { description: z.string().optional() } });
        const OverriddenSchema = defineSchema(TodoSchema, { fields: { name: z.string() } });

        class ExtendedTodo extends ExtendedSchema {}

        bootModels({ ExtendedTodo });

        // Act
        const extendedTask = await ExtendedTodo.fromRDF(quads).find('solid://tasks#it');

        await Todo.updateSchema(OverriddenSchema);

        const overriddenTask = await Todo.fromRDF(quads)
            .find('solid://tasks#it')
            .catch((error: unknown) => error);

        // Assert
        expect(extendedTask?.name).toEqual('Learn Solid');
        expect(overriddenTask).toBeInstanceOf(Error);
    });

    it('reads values from multiple properties in order', async () => {
        // Arrange
        const quads = await turtleToQuads(`
            @prefix dc: <http://purl.org/dc/terms/> .

            <solid://tasks#it> a <${ICAL}Vtodo> ; dc:title "Learn Solid" .
        `);
        const nameDefinition = z.string().rdfProperties(['name', 'ical:summary', 'dc:title']);
        const Schema = defineSchema(TodoSchema, {
            rdfContexts: { dc: 'http://purl.org/dc/terms/' },
            fields: { name: nameDefinition },
        });

        await Todo.updateSchema(Schema);

        // Act
        const task = await Todo.fromRDF(quads).find('solid://tasks#it');

        // Assert
        expect(task?.name).toEqual('Learn Solid');
    });

    it('reads and writes RDF properties in zod definitions', () => {
        const definition = z.string().rdfProperties(['name', 'ical:summary']);

        expect(definition.rdfProperties()).toEqual(['name', 'ical:summary']);
        expect(z.string().rdfProperty('name').rdfProperties()).toEqual(['name']);
        expect(z.string().rdfProperties()).toBeUndefined();
    });

    async function loadOperations(url: string): Promise<PropertyOperation[]> {
        const task = await Todo.findOrFail(url);

        return (await task.loadRelation('operations')) as PropertyOperation[];
    }

    function predicateValues(quads: Quad[], predicate: string): string[] {
        return quads.filter((quad) => quad.predicate.value === predicate).map((quad) => quad.object.value);
    }
});

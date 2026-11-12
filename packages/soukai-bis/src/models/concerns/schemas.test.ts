import { turtleToQuads } from '@noeldemartin/solid-utils';
import { required } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { bootModels } from 'soukai-bis/models/registry';
import { belongsToOne } from 'soukai-bis/models/relations/fluent';
import { remote } from 'soukai-bis/models/remote';
import { defineSchema } from 'soukai-bis/models/schema';
import Task from 'soukai-bis/testing/stubs/Task';
import TaskICalSchema from 'soukai-bis/testing/stubs/Task.ical.schema';
import { describe, expect, it } from 'vite-plus/test';
import { string, url } from 'zod';

describe('Schemas', () => {
    it('updates schemas', async () => {
        // Arrange
        const quads = await turtleToQuads(
            `
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#> .

                <#task>
                    a ical:Vtodo ;
                    ical:summary "Learn Solid" ;
                    ical:relatedTo <solid://projects/solid#it> .
            `,
            { baseIRI: 'solid://tasks/learn-solid' },
        );

        // Act
        Task.updateSchema(TaskICalSchema);

        // Assert
        const task = required(await Task.createFromRDF(quads, { url: 'solid://tasks/learn-solid#task' }));
        const turtle = await new Task({ name: 'Write docs', url: 'solid://tasks/write-docs#task' }).toTurtle();

        expect(task.name).toEqual('Learn Solid');
        expect(task.projectUrl).toEqual('solid://projects/solid#it');
        expect(Task.getRdfClasses()).toEqual(['http://www.w3.org/2002/12/cal/ical#Vtodo']);
        expect(Task.urlFromSlug('write-docs')).toMatch(/write-docs#task$/);
        expect(turtle).toContain('<http://www.w3.org/2002/12/cal/ical#Vtodo>');
        expect(turtle).toContain('<http://www.w3.org/2002/12/cal/ical#summary>');
        expect(turtle).not.toContain('https://schema.org/');
        expect(remote(Task).schema).toBe(Task.schema);
    });

    it('keeps relations, computed attributes, and config', () => {
        // Arrange
        const { relations, computed } = Task.schema;

        // Act
        Task.updateSchema(TaskICalSchema);

        // Assert
        expect(Task.schema.relations).toBe(relations);
        expect(Task.schema.computed).toBe(computed);
        expect(Task.schema.relations).toHaveProperty('project');
        expect(Task.schema.relations).toHaveProperty('metadata');
    });

    it('uses the default RDF class without changing the schema', () => {
        // Arrange
        const ClasslessSchema = defineSchema({
            rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
            fields: { name: string() },
        });

        // Act
        Task.updateSchema(ClasslessSchema);

        // Assert
        expect(Task.getRdfClasses()).toEqual(['http://www.w3.org/2002/12/cal/ical#Task']);
        expect(ClasslessSchema.schema.rdfClasses).toEqual([]);
        expect(Task.schema).not.toBe(ClasslessSchema.schema);
    });

    it('fails with different config', () => {
        // Arrange
        const HistorySchema = defineSchema(TaskICalSchema, { history: true });

        // Act & Assert
        expect(() => Task.updateSchema(HistorySchema)).toThrow(SoukaiError);
    });

    it('fails with unknown relations', () => {
        // Arrange
        const RelationsSchema = defineSchema(TaskICalSchema, {
            fields: { assigneeUrl: url().optional() },
            relations: { assignee: belongsToOne('User', 'assigneeUrl') },
        });

        // Act & Assert
        expect(() => Task.updateSchema(RelationsSchema)).toThrow(SoukaiError);
    });

    it('restores the original schema when models are reset', () => {
        // Arrange
        const originalSchema = Task.schema;

        Task.updateSchema(TaskICalSchema);

        // Act
        bootModels({ Task }, { reset: true });

        // Assert
        expect(Task.schema).toBe(originalSchema);
        expect(Task.getRdfClasses()).toEqual(['https://schema.org/Action']);
    });

    it('restores the original schema after updating it multiple times', () => {
        // Arrange
        const originalSchema = Task.schema;

        Task.updateSchema(TaskICalSchema);
        Task.updateSchema(defineSchema(TaskICalSchema, { rdfClass: 'Vevent' }));

        // Act
        Task.reset();

        // Assert
        expect(Task.schema).toBe(originalSchema);
    });
});

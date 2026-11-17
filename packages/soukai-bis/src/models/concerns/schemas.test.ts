import { turtleToQuads } from '@noeldemartin/solid-utils';
import { required } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getSchema } from 'soukai-bis/models/internals/model';
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
        await Task.updateSchema(TaskICalSchema);

        // Assert
        const task = required(await Task.createFromRDF(quads, { url: 'solid://tasks/learn-solid#task' }));
        const turtle = await new Task({ name: 'Write docs', url: 'solid://tasks/write-docs#task' }).toTurtle();

        expect(task.name).toEqual('Learn Solid');
        expect(task.projectUrl).toEqual('solid://projects/solid#it');
        expect(Task.getRDFClasses()).toEqual(['http://www.w3.org/2002/12/cal/ical#Vtodo']);
        expect(Task.urlFromSlug('write-docs')).toMatch(/write-docs#task$/);
        expect(turtle).toContain('<http://www.w3.org/2002/12/cal/ical#Vtodo>');
        expect(turtle).toContain('<http://www.w3.org/2002/12/cal/ical#summary>');
        expect(turtle).not.toContain('https://schema.org/');
        expect(getSchema(remote(Task))).toBe(getSchema(Task));
    });

    it('keeps relations, computed attributes, and config', async () => {
        // Arrange
        const { relations, computed } = getSchema(Task);

        // Act
        await Task.updateSchema(TaskICalSchema);

        // Assert
        expect(getSchema(Task).relations).toBe(relations);
        expect(getSchema(Task).computed).toBe(computed);
        expect(getSchema(Task).relations).toHaveProperty('project');
        expect(getSchema(Task).relations).toHaveProperty('metadata');
    });

    it('uses the default RDF class without changing the schema', async () => {
        // Arrange
        const ClasslessSchema = defineSchema({
            rdfContext: 'http://www.w3.org/2002/12/cal/ical#',
            fields: { name: string() },
        });

        // Act
        await Task.updateSchema(ClasslessSchema);

        // Assert
        expect(Task.getRDFClasses()).toEqual(['http://www.w3.org/2002/12/cal/ical#Task']);
        expect(getSchema(ClasslessSchema).rdfClasses.classes).toEqual([]);
        expect(getSchema(Task)).not.toBe(getSchema(ClasslessSchema));
    });

    it('fails with different config', async () => {
        // Arrange
        const HistorySchema = defineSchema(TaskICalSchema, { history: true });

        // Act & Assert
        await expect(Task.updateSchema(HistorySchema)).rejects.toThrow(SoukaiError);
    });

    it('fails with unknown relations', async () => {
        // Arrange
        const RelationsSchema = defineSchema(TaskICalSchema, {
            fields: { assigneeUrl: url().optional() },
            relations: { assignee: belongsToOne('User', 'assigneeUrl') },
        });

        // Act & Assert
        await expect(Task.updateSchema(RelationsSchema)).rejects.toThrow(SoukaiError);
    });

    it('restores the original schema when models are reset', async () => {
        // Arrange
        const originalSchema = getSchema(Task);

        await Task.updateSchema(TaskICalSchema);

        // Act
        bootModels({ Task }, { reset: true });

        // Assert
        expect(getSchema(Task)).toBe(originalSchema);
        expect(Task.getRDFClasses()).toEqual(['https://schema.org/Action']);
    });

    it('restores the original schema after updating it multiple times', async () => {
        // Arrange
        const originalSchema = getSchema(Task);

        await Task.updateSchema(TaskICalSchema);
        await Task.updateSchema(defineSchema(TaskICalSchema, { rdfClass: 'Vevent' }));

        // Act
        Task.reset();

        // Assert
        expect(getSchema(Task)).toBe(originalSchema);
    });
});

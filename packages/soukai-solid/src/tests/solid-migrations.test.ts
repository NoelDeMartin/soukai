import { beforeEach, describe, expect, it } from 'vitest';
import { FieldType, bootModels, setEngine } from 'soukai';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';

import { defineSolidModelSchema } from 'soukai-solid/models/schema';

import SchemaTaskSchema from 'soukai-solid/testing/lib/stubs/SchemaTask.schema';
import ICalTaskSchema, { ICAL_TASK_FIELDS } from 'soukai-solid/testing/lib/stubs/ICalTask.schema';

class Task extends SchemaTaskSchema {}

describe('Solid Schema Migrations', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Task });
    });

    it('migrates schemas', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        const task = await Task.create({
            url: `${documentUrl}#it`,
            name: 'Migrate schemas',
        });

        FakeServer.respondOnce(documentUrl, FakeResponse.success(await task.toTurtle()));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const migrated = await task.migrateSchema(ICalTaskSchema);

        // Assert
        expect(migrated.url).toEqual(`${documentUrl}#it`);
        expect(migrated.name).toEqual('Migrate schemas');
        expect(migrated.operations).toHaveLength(0);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(4);

        expect(FakeServer.getRequests()[3]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/>.

                <#it>
                    a schema:Action ;
                    schema:name "Migrate schemas" .
            } ;

            INSERT DATA {
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#>.

                <#it>
                    a ical:Vtodo ;
                    ical:summary "Migrate schemas" .
            } .
        `);
    });

    it('migrates schemas with history', async () => {
        // Arrange
        const documentUrl = fakeDocumentUrl();

        FakeServer.respondOnce(documentUrl, FakeResponse.notFound());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        const task = await Task.create({
            url: `${documentUrl}#it`,
            name: 'Initial name',
            status: 'https://schema.org/PotentialActionStatus',
            completedAt: new Date(),
        });

        await task.update({ name: 'Updated name' });

        FakeServer.respondOnce(documentUrl, FakeResponse.success(await task.toTurtle({ history: true })));
        FakeServer.respondOnce(documentUrl, FakeResponse.success());

        // Act
        const migrated = await task.migrateSchema(ICalTaskSchema);

        // Assert
        expect(migrated.url).toEqual(`${documentUrl}#it`);
        expect(migrated.name).toEqual('Updated name');
        expect(migrated.operations).toHaveLength(3);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);

        expect(FakeServer.getRequests()[5]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/>.
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
                @prefix xml: <http://www.w3.org/2001/XMLSchema#>.

                <#it>
                    a schema:Action ;
                    schema:name "Updated name" ;
                    schema:status schema:PotentialActionStatus .

                <[[operation-1][.*]]> crdt:property schema:name .

                <[[operation-2][.*]]>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "[[.*]]"^^xml:dateTime ;
                    crdt:property schema:status ;
                    crdt:value schema:PotentialActionStatus .

                <[[operation-3][.*]]> crdt:property schema:name .
            } ;

            INSERT DATA {
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#>.
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/>.

                <#it>
                    a ical:Vtodo ;
                    ical:summary "Updated name" .

                <[[operation-1][.*]]> crdt:property ical:summary .
                <[[operation-3][.*]]> crdt:property ical:summary .
            } .
        `);
    });

    it('changes urls when migrating schemas', async () => {
        // Arrange
        const url = fakeDocumentUrl();

        FakeServer.respondOnce(url, FakeResponse.notFound());
        FakeServer.respondOnce(url, FakeResponse.success());
        FakeServer.respondOnce(url, FakeResponse.success());
        FakeServer.respondOnce(url, FakeResponse.success());

        const task = await Task.create({
            url,
            name: 'Initial name',
            status: 'https://schema.org/PotentialActionStatus',
            completedAt: new Date(),
        });

        await task.update({ name: 'Updated name' });

        FakeServer.respondOnce(url, FakeResponse.success(await task.toTurtle({ history: true })));
        FakeServer.respondOnce(url, FakeResponse.success());

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
        expect(migrated.url).toEqual(`${url}#it`);
        expect(migrated.name).toEqual('Updated name');
        expect(migrated.description).toEqual('Updated name');
        expect(migrated.priority).toEqual(1);
        expect(migrated.operations).toHaveLength(5);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);

        expect(FakeServer.getRequests()[5]?.body).toEqualSparql(`
            DELETE DATA {
                @prefix schema: <https://schema.org/>.
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
                @prefix xml: <http://www.w3.org/2001/XMLSchema#>.
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#>.

                <>
                    a schema:Action ;
                    schema:name "Updated name" ;
                    schema:status schema:PotentialActionStatus ;
                    ical:completed "[[completedAt][.*]]"^^xml:dateTime .

                <#metadata> crdt:resource <> .

                <[[operation-1][.*]]>
                    crdt:resource <> ;
                    crdt:property schema:name .

                <[[operation-2][.*]]>
                    crdt:resource <> .

                <[[operation-3][.*]]>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <> ;
                    crdt:date "[[.*]]"^^xml:dateTime ;
                    crdt:property schema:status ;
                    crdt:value schema:PotentialActionStatus .

                <[[operation-4][.*]]>
                    crdt:resource <> ;
                    crdt:property schema:name .
            } ;

            INSERT DATA {
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#>.
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
                @prefix xml: <http://www.w3.org/2001/XMLSchema#>.

                <#it>
                    a ical:Vtodo ;
                    ical:summary "Updated name" ;
                    ical:description "Updated name" ;
                    ical:priority 1 ;
                    ical:completed "[[completedAt][.*]]"^^xml:dateTime .

                <#metadata> crdt:resource <#it> .

                <[[operation-1][.*]]>
                    crdt:resource <#it> ;
                    crdt:property ical:summary .

                <[[operation-2][.*]]>
                    crdt:resource <#it> .

                <[[operation-3][.*]]>
                    crdt:resource <#it> ;
                    crdt:property ical:summary .

                <[[operation-4][.*]]>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "[[.*]]"^^xml:dateTime ;
                    crdt:property ical:priority ;
                    crdt:value 1 .

                <[[operation-5][.*]]>
                    a crdt:SetPropertyOperation ;
                    crdt:resource <#it> ;
                    crdt:date "[[.*]]"^^xml:dateTime ;
                    crdt:property ical:description ;
                    crdt:value "Updated name" .
            } .
        `);
    });

});

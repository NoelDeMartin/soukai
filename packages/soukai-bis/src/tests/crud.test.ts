import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';

import Person from 'soukai-bis/testing/stubs/Person';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine } from 'soukai-bis/engines';

describe('CRUD', () => {

    beforeEach(() => setEngine(new SolidEngine(FakeServer.fetch)));

    it('Creates models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });

        FakeServer.respondOnce('*', FakeResponse.notFound()); // Check if document exists
        FakeServer.respondOnce('*', FakeResponse.created()); // Create document

        // Act
        const user = await Person.create({ name, age });

        // Assert
        expect(user.metadata).not.toBeNull();
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);

        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            INSERT DATA {
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a foaf:Person ;
                    foaf:name "${name}" ;
                    foaf:age ${age} .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "[[.*]]"^^xsd:dateTime ;
                    crdt:updatedAt "[[.*]]"^^xsd:dateTime .
            }
        `);
    });

    it('Updates models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });
        const documentUrl = fakeDocumentUrl();
        const createdAt = new Date(Date.now() - 1000);
        const user = new Person({ url: `${documentUrl}#it`, name, age }, true);

        user.metadata?.setAttribute('url', `${documentUrl}#it-metadata`);
        user.metadata?.setAttribute('createdAt', createdAt);
        user.metadata?.setAttribute('updatedAt', createdAt);
        user.metadata?.setExists(true);
        user.metadata?.cleanDirty();

        FakeServer.respondOnce(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix crdt: <https://vocab.noeldemartin.com/crdt/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a foaf:Person ;
                    foaf:name "${name}" ;
                    foaf:age ${age} .

                <#it-metadata>
                    a crdt:Metadata ;
                    crdt:resource <#it> ;
                    crdt:createdAt "${user.createdAt?.toISOString()}"^^xsd:dateTime ;
                    crdt:updatedAt "${user.updatedAt?.toISOString()}"^^xsd:dateTime .
            `,
        ); // GET document for update (SolidEngine reads it first to diff)
        FakeServer.respondOnce(documentUrl, FakeResponse.success()); // PATCH document

        // Act
        await user.update({ name: newName });

        // Assert
        expect(user.name).toBe(newName);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        await expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "${name}" .
                <#it-metadata> <https://vocab.noeldemartin.com/crdt/updatedAt>
                    "${createdAt?.toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            } ;
            INSERT DATA {
                <#it> <http://xmlns.com/foaf/0.1/name> "${newName}" .
                <#it-metadata> <https://vocab.noeldemartin.com/crdt/updatedAt>
                    "[[.*]]"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
            }
        `);
    });

    it('Reads single models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });
        const documentUrl = fakeDocumentUrl();

        FakeServer.respondOnce(
            documentUrl,
            `
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <#it>
                    a foaf:Person ;
                    foaf:name "${name}" ;
                    foaf:age ${age} .
            `,
        );

        // Act
        const user = await Person.find(`${documentUrl}#it`);

        // Assert
        expect(user).toBeInstanceOf(Person);
        expect(user?.url).toEqual(`${documentUrl}#it`);
        expect(user?.name).toEqual(name);
        expect(user?.age).toEqual(age);
    });

    it('Deletes models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });
        const documentUrl = fakeDocumentUrl();
        const user = new Person({ url: `${documentUrl}#it`, name, age }, true);

        FakeServer.respondOnce(documentUrl, FakeResponse.success()); // DELETE document

        // Act
        await user.delete();

        // Assert
        expect(user.exists()).toBe(false);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);
        expect(FakeServer.fetch).toHaveBeenCalledWith(
            documentUrl,
            expect.objectContaining({
                method: 'DELETE',
            }),
        );
    });

});

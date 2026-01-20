import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';

import User from 'soukai-bis/testing/stubs/User';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { bootModels } from 'soukai-bis/models/utils';
import { setEngine } from 'soukai-bis/engines';

describe('CRUD', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ User }, true);
    });

    it('Creates models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });

        FakeServer.respondOnce('*', FakeResponse.notFound()); // Check if document exists
        FakeServer.respondOnce('*', FakeResponse.created()); // Create document

        // Act
        await User.create({ name, age });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        const url = FakeServer.fetchSpy.mock.calls[1]?.[0] as string;
        const body = FakeServer.fetchSpy.mock.calls[1]?.[1]?.body;

        expect(body).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <${url}#it>
                a foaf:Person ;
                foaf:name "${name}" ;
                foaf:age ${age} .
        `);
    });

    it('Updates models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });
        const documentUrl = fakeDocumentUrl();
        const user = new User({ url: `${documentUrl}#it`, name, age }, true);

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
        ); // GET document for update (SolidEngine reads it first to diff)
        FakeServer.respondOnce(documentUrl, FakeResponse.success()); // PATCH document

        // Act
        await user.update({ name: newName });

        // Assert
        expect(user.name).toBe(newName);
        expect(FakeServer.fetch).toHaveBeenCalledTimes(2);

        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(`
            DELETE DATA {
                <${documentUrl}#it> <http://xmlns.com/foaf/0.1/name> "${name}" .
            } ;
            INSERT DATA {
                <${documentUrl}#it> <http://xmlns.com/foaf/0.1/name> "${newName}" .
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
        const user = await User.find(`${documentUrl}#it`);

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user?.url).toEqual(`${documentUrl}#it`);
        expect(user?.name).toEqual(name);
        expect(user?.age).toEqual(age);
    });

    it('Deletes models', async () => {
        // Arrange
        const name = faker.name.firstName();
        const age = faker.datatype.number({ min: 18, max: 99 });
        const documentUrl = fakeDocumentUrl();
        const user = new User({ url: `${documentUrl}#it`, name, age }, true);

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

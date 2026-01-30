import { beforeEach, describe, expect, it } from 'vitest';
import { FakeResponse, FakeServer } from '@noeldemartin/testing';

import BasePerson from 'soukai-bis/testing/stubs/Person';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { bootModels } from 'soukai-bis/models/registry';
import { defineSchema } from 'soukai-bis/models/schema';
import { setEngine } from 'soukai-bis/engines';
import { loadFixture } from 'soukai-bis/testing/utils/fixtures';

const fixture = <T = string>(name: string) => loadFixture<T>(`crdts/${name}`);
const Person = defineSchema(BasePerson, { history: true });

describe('CRDTs', () => {

    beforeEach(() => {
        setEngine(new SolidEngine(FakeServer.fetch));
        bootModels({ Person }, true);
    });

    it('Updates metadata and creates operations', async () => {
        // Arrange - stub create requests
        FakeServer.respondOnce('*', FakeResponse.notFound());
        FakeServer.respondOnce('*', FakeResponse.success());

        // Arrange - stub first update requests
        FakeServer.respondOnce('*', FakeResponse.success(fixture('griffith-1.ttl')));
        FakeServer.respondOnce('*', FakeResponse.success());

        // Arrange - stub second update requests
        FakeServer.respondOnce('*', FakeResponse.success(fixture('griffith-2.ttl')));
        FakeServer.respondOnce('*', FakeResponse.success());

        // Act
        const griffith = await Person.create({ name: 'Griffith' });

        await griffith.update({ name: 'Femto', givenName: 'Wings of Darkness', lastName: null });
        await griffith.update({ name: 'Griffith', givenName: 'Falcon of Light' });

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(6);
        expect(FakeServer.fetchSpy.mock.calls[1]?.[1]?.body).toEqualSparql(fixture('create-griffith.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[3]?.[1]?.body).toEqualSparql(fixture('update-griffith-1.sparql'));
        expect(FakeServer.fetchSpy.mock.calls[5]?.[1]?.body).toEqualSparql(fixture('update-griffith-2.sparql'));
    });

});

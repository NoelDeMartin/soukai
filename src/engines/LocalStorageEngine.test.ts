import { beforeEach, describe, expect, it } from 'vitest';

import { faker } from '@noeldemartin/faker';

import DocumentNotFound from 'soukai/errors/DocumentNotFound';
import { bootModels } from 'soukai/models';
import { LocalStorageEngine } from 'soukai/engines/LocalStorageEngine';

import User from 'soukai/testing/stubs/User';
import FakeLocalStorage from 'soukai/testing/fakes/FakeLocalStorage';

describe('LocalStorageEngine', () => {

    let engine: LocalStorageEngine;
    let storage: FakeLocalStorage;
    let prefix: string;

    beforeEach(() => {
        bootModels({ User });

        globalThis.localStorage = storage = new FakeLocalStorage();
        engine = new LocalStorageEngine((prefix = faker.random.word()));
    });

    it('create', async () => {
        const name = faker.name.firstName();

        const id = await engine.create(User.collection, { name });

        expect(storage.setItem).toHaveBeenCalledTimes(1);
        expect(storage.setItem).toHaveBeenCalledWith(prefix + User.collection, JSON.stringify({ [id]: { name } }));
    });

    it('read one', async () => {
        const name = faker.name.firstName();
        const id = faker.datatype.uuid();

        storage.data[prefix + User.collection] = JSON.stringify({ [id]: { name } });

        const document = await engine.readOne(User.collection, id);

        expect(document).toEqual({ name });
    });

    it('read one non existent', async () => {
        await expect(engine.readOne(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('read many', async () => {
        let otherCollection;

        do {
            otherCollection = faker.lorem.word();
        } while (User.collection === otherCollection);

        const firstId = faker.datatype.uuid();
        const firstName = faker.name.firstName();
        const secondId = faker.datatype.uuid();
        const secondName = faker.name.firstName();

        storage.data[prefix + User.collection] = JSON.stringify({
            [firstId]: { name: firstName },
            [secondId]: { name: secondName },
        });

        storage.data[prefix + otherCollection] = JSON.stringify({
            [faker.datatype.uuid()]: { name: faker.name.firstName() },
        });

        const documents = await engine.readMany(User.collection);

        expect(Object.values(documents)).toHaveLength(2);
        expect(documents[firstId]).toEqual({ name: firstName });
        expect(documents[secondId]).toEqual({ name: secondName });
    });

    it('read many filters', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        storage.data[prefix + User.collection] = JSON.stringify({
            [faker.datatype.uuid()]: { name: faker.name.firstName() },
            [id]: { name },
        });

        const documents = await engine.readMany(User.collection, { name });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    });

    it('update', async () => {
        const id = faker.datatype.uuid();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number();

        storage.data[prefix + User.collection] = JSON.stringify({
            [id]: { name: initialName, surname: faker.name.lastName(), age },
        });

        await engine.update(User.collection, id, { name: newName, surname: { $unset: true } });

        expect(storage.setItem).toHaveBeenCalledTimes(1);
        expect(storage.setItem).toHaveBeenCalledWith(
            prefix + User.collection,
            JSON.stringify({
                [id]: { name: newName, age },
            }),
        );
    });

    it('update non existent', async () => {
        await expect(engine.update(User.collection, faker.datatype.uuid(), {})).rejects.toThrow(DocumentNotFound);
    });

    it('delete', async () => {
        // Arrange
        const firstId = faker.datatype.uuid();
        const secondId = faker.datatype.uuid();
        const name = faker.name.firstName();

        storage.data[prefix + User.collection] = JSON.stringify({
            [firstId]: { name: faker.name.firstName() },
            [secondId]: { name },
        });

        // Act
        await engine.delete(User.collection, firstId);

        // Assert
        expect(storage.setItem).toHaveBeenCalledWith(
            prefix + User.collection,
            JSON.stringify({
                [secondId]: { name },
            }),
        );
    });

    it('delete non existent', async () => {
        await expect(engine.delete(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

});

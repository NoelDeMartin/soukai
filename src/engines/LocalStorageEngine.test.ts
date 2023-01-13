import Faker from 'faker';


import { bootModels } from '@/models';

import { LocalStorageEngine } from '@/engines/LocalStorageEngine';

import DocumentNotFound from '@/errors/DocumentNotFound';

import MockLocalStorage from '@/testing/mocks/MockLocalStorage';

import User from '@/testing/stubs/User';

describe('LocalStorageEngine', () => {

    let engine: LocalStorageEngine;
    let prefix: string;

    beforeEach(() => {
        bootModels({ User });
        MockLocalStorage.reset();

        (window as unknown as { _localStorage: unknown })._localStorage = MockLocalStorage;

        engine = new LocalStorageEngine(prefix = Faker.random.word());
    });

    it('testCreate', async () => {
        const name = Faker.name.firstName();

        return engine.create(User.collection, { name }).then(id => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                prefix + User.collection,
                JSON.stringify({ [id]: { name } }),
            );
        });
    });

    it('testReadOne', async () => {
        const name = Faker.name.firstName();
        const id = Faker.random.uuid();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [id]: { name },
            }),
        });

        return engine.readOne(User.collection, id).then(document => {
            expect(document).toEqual({ name });
        });
    });

    it('testReadOneNonExistent', async () => {
        await expect(engine.readOne(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testReadMany', async () => {
        let otherCollection;

        do {
            otherCollection = Faker.lorem.word();
        } while (User.collection === otherCollection);

        const firstId = Faker.random.uuid();
        const firstName = Faker.name.firstName();
        const secondId = Faker.random.uuid();
        const secondName = Faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [firstId]: { name: firstName },
                [secondId]: { name: secondName },
            }),
            [prefix + otherCollection]: JSON.stringify({
                [Faker.random.uuid()]: { name: Faker.name.firstName() },
            }),
        });

        return engine.readMany(User.collection).then(documents => {
            expect(Object.values(documents)).toHaveLength(2);
            expect(documents[firstId]).toEqual({ name: firstName });
            expect(documents[secondId]).toEqual({ name: secondName });
        });
    });

    it('testReadManyFilters', async () => {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [Faker.random.uuid()]: { name: Faker.name.firstName() },
                [id]: { name },
            }),
        });

        const documents = await engine.readMany(User.collection, { name });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    });

    it('testUpdate', async () => {
        const id = Faker.random.uuid();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const age = Faker.random.number();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [id]: { name: initialName, surname: Faker.name.lastName(), age },
            }),
        });

        return engine.update(User.collection, id, { name: newName, surname: { $unset: true } }).then(() => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                prefix + User.collection,
                JSON.stringify({
                    [id]: { name: newName, age },
                }),
            );
        });
    });

    it('testUpdateNonExistent', async () => {
        await expect(engine.update(User.collection, Faker.random.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    });

    it('testDelete', async () => {
        // Arrange
        const firstId = Faker.random.uuid();
        const secondId = Faker.random.uuid();
        const name = Faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [firstId]: { name: Faker.name.firstName() },
                [secondId]: { name },
            }),
        });

        // Act
        await engine.delete(User.collection, firstId);

        // Assert
        expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
            prefix + User.collection,
            JSON.stringify({
                [secondId]: { name },
            }),
        );
    });

    it('testDeleteNonExistent', async () => {
        await expect(engine.delete(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    });

});

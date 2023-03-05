import { faker } from '@noeldemartin/faker';


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

        engine = new LocalStorageEngine(prefix = faker.random.word());
    });

    it('testCreate', async () => {
        const name = faker.name.firstName();

        return engine.create(User.collection, { name }).then(id => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                prefix + User.collection,
                JSON.stringify({ [id]: { name } }),
            );
        });
    });

    it('testReadOne', async () => {
        const name = faker.name.firstName();
        const id = faker.datatype.uuid();

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
        await expect(engine.readOne(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testReadMany', async () => {
        let otherCollection;

        do {
            otherCollection = faker.lorem.word();
        } while (User.collection === otherCollection);

        const firstId = faker.datatype.uuid();
        const firstName = faker.name.firstName();
        const secondId = faker.datatype.uuid();
        const secondName = faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [firstId]: { name: firstName },
                [secondId]: { name: secondName },
            }),
            [prefix + otherCollection]: JSON.stringify({
                [faker.datatype.uuid()]: { name: faker.name.firstName() },
            }),
        });

        return engine.readMany(User.collection).then(documents => {
            expect(Object.values(documents)).toHaveLength(2);
            expect(documents[firstId]).toEqual({ name: firstName });
            expect(documents[secondId]).toEqual({ name: secondName });
        });
    });

    it('testReadManyFilters', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [faker.datatype.uuid()]: { name: faker.name.firstName() },
                [id]: { name },
            }),
        });

        const documents = await engine.readMany(User.collection, { name });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    });

    it('testUpdate', async () => {
        const id = faker.datatype.uuid();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [id]: { name: initialName, surname: faker.name.lastName(), age },
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
        await expect(engine.update(User.collection, faker.datatype.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    });

    it('testDelete', async () => {
        // Arrange
        const firstId = faker.datatype.uuid();
        const secondId = faker.datatype.uuid();
        const name = faker.name.firstName();

        MockLocalStorage.setData({
            [prefix + User.collection]: JSON.stringify({
                [firstId]: { name: faker.name.firstName() },
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
        await expect(engine.delete(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

});

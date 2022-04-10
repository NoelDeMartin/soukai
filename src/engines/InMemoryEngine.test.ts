import Faker from 'faker';

import Soukai from '@/Soukai';

import { Model } from '@/models/Model';

import { InMemoryEngine } from '@/engines/InMemoryEngine';
import type { InMemoryEngineCollection } from '@/engines/InMemoryEngine';

import DocumentNotFound from '@/errors/DocumentNotFound';

import User from '@/testing/stubs/User';

describe('InMemoryEngine', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        Soukai.loadModels({ User });

        engine = new InMemoryEngine();
    });

    it('testCreate', async () => {
        const name = Faker.name.firstName();

        return engine.create(User.collection, { name }).then(id => {
            expect(engine.database).toHaveProperty(User.collection);
            expect(engine.database[User.collection]).toHaveProperty(id);
            expect(Object.keys(engine.database[User.collection] as InMemoryEngineCollection)).toHaveLength(1);
            expect(engine.database[User.collection]?.[id]).toEqual({ name });
        });
    });

    it('testReadOne', async () => {
        const name = Faker.name.firstName();

        let id;

        return engine.create(User.collection, { name })
            .then(documentId => {
                id = documentId;
                return engine.readOne(User.collection, id);
            })
            .then(document => {
                expect(document).toEqual({ name });
            });
    });

    it('testReadOneNonExistent', async () => {
        await expect(engine.readOne(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testReadMany', async () => {
        let otherCollection: string;

        do {
            otherCollection = Faker.lorem.word();
        } while (User.collection === otherCollection);

        class StubModel extends Model {

            public static collection = otherCollection;

        }

        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        const ids: string[] = [];

        return Promise.all([
            engine.create(User.collection, { name: firstName }).then(id => ids.push(id)),
            engine.create(User.collection, { name: secondName }).then(id => ids.push(id)),
            engine.create(StubModel.collection, { name: Faker.name.firstName() }),
        ])
            .then(() => engine.readMany(User.collection))
            .then(documents => {
                expect(Object.values(documents)).toHaveLength(2);
                expect(documents[ids[0] as string]).toEqual({ name: firstName });
                expect(documents[ids[1] as string]).toEqual({ name: secondName });
            });
    });

    it('testReadManyFilters', async () => {
        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        await engine.create(User.collection, { name: firstName });
        const id = await engine.create(User.collection, { name: secondName });

        const documents = await engine.readMany(User.collection, { name: secondName });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name: secondName });
    });

    it('testUpdate', async () => {
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const age = Faker.random.number();

        let id: string;

        return engine.create(User.collection, { name: initialName, surname: Faker.name.lastName(), age })
            .then(documentId => {
                id = documentId;
                return engine.update(User.collection, id, { name: newName, surname: { $unset: true } });
            })
            .then(() => {
                expect(engine.database[User.collection]?.[id]).toEqual({ name: newName, age });
            });
    });

    it('testUpdateNonExistent', async () => {
        await expect(engine.update(User.collection, Faker.random.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    });

    it('testDelete', async () => {
        const id = await engine.create(User.collection, { name: Faker.name.firstName() });

        await engine.delete(User.collection, id);

        expect(Object.keys(engine.database[User.collection] as InMemoryEngineCollection)).toHaveLength(0);
    });

    it('testDeleteNonExistent', async () => {
        await expect(engine.delete(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    });

});

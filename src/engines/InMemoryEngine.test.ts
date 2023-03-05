import { faker } from '@noeldemartin/faker';

import { bootModels } from '@/models';
import { Model } from '@/models/Model';

import { InMemoryEngine } from '@/engines/InMemoryEngine';
import type { InMemoryEngineCollection } from '@/engines/InMemoryEngine';

import DocumentNotFound from '@/errors/DocumentNotFound';

import User from '@/testing/stubs/User';

describe('InMemoryEngine', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        bootModels({ User });

        engine = new InMemoryEngine();
    });

    it('testCreate', async () => {
        const name = faker.name.firstName();

        return engine.create(User.collection, { name }).then(id => {
            expect(engine.database).toHaveProperty(User.collection);
            expect(engine.database[User.collection]).toHaveProperty(id);
            expect(Object.keys(engine.database[User.collection] as InMemoryEngineCollection)).toHaveLength(1);
            expect(engine.database[User.collection]?.[id]).toEqual({ name });
        });
    });

    it('testReadOne', async () => {
        const name = faker.name.firstName();

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
        await expect(engine.readOne(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

    it('testReadMany', async () => {
        let otherCollection: string;

        do {
            otherCollection = faker.lorem.word();
        } while (User.collection === otherCollection);

        class StubModel extends Model {

            public static collection = otherCollection;

        }

        const firstName = faker.name.firstName();
        const secondName = faker.name.firstName();

        const ids: string[] = [];

        return Promise.all([
            engine.create(User.collection, { name: firstName }).then(id => ids.push(id)),
            engine.create(User.collection, { name: secondName }).then(id => ids.push(id)),
            engine.create(StubModel.collection, { name: faker.name.firstName() }),
        ])
            .then(() => engine.readMany(User.collection))
            .then(documents => {
                expect(Object.values(documents)).toHaveLength(2);
                expect(documents[ids[0] as string]).toEqual({ name: firstName });
                expect(documents[ids[1] as string]).toEqual({ name: secondName });
            });
    });

    it('testReadManyFilters', async () => {
        const firstName = faker.name.firstName();
        const secondName = faker.name.firstName();

        await engine.create(User.collection, { name: firstName });
        const id = await engine.create(User.collection, { name: secondName });

        const documents = await engine.readMany(User.collection, { name: secondName });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name: secondName });
    });

    it('testUpdate', async () => {
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const age = faker.datatype.number();

        let id: string;

        return engine.create(User.collection, { name: initialName, surname: faker.name.lastName(), age })
            .then(documentId => {
                id = documentId;
                return engine.update(User.collection, id, { name: newName, surname: { $unset: true } });
            })
            .then(() => {
                expect(engine.database[User.collection]?.[id]).toEqual({ name: newName, age });
            });
    });

    it('testUpdateNonExistent', async () => {
        await expect(engine.update(User.collection, faker.datatype.uuid(), {}))
            .rejects.toThrow(DocumentNotFound);
    });

    it('testDelete', async () => {
        const id = await engine.create(User.collection, { name: faker.name.firstName() });

        await engine.delete(User.collection, id);

        expect(Object.keys(engine.database[User.collection] as InMemoryEngineCollection)).toHaveLength(0);
    });

    it('testDeleteNonExistent', async () => {
        await expect(engine.delete(User.collection, faker.datatype.uuid())).rejects.toThrow(DocumentNotFound);
    });

});

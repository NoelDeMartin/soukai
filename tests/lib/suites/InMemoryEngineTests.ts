import Faker from 'faker';

import Model from '@/models/Model';

import InMemoryEngine from '@/engines/InMemoryEngine';

import DocumentNotFound from '@/errors/DocumentNotFound';

import TestSuite from '../TestSuite';

import User from '../stubs/User';

export default class extends TestSuite {

    public static title: string = 'InMemory';

    private engine: InMemoryEngine;

    public setUp(): void {
        User.load();
        this.engine = new InMemoryEngine();
    }

    public testCreate(): Promise<void> {
        const name = Faker.name.firstName();

        return this.engine.create(User.collection, { name }).then(id => {
            expect(this.engine.database).toHaveProperty(User.collection);
            expect(this.engine.database[User.collection]).toHaveProperty(id);
            expect(Object.keys(this.engine.database[User.collection])).toHaveLength(1);
            expect(this.engine.database[User.collection][id]).toEqual({ name });
        });
    }

    public testReadOne(): Promise<void> {
        const name = Faker.name.firstName();

        let id;

        return this.engine.create(User.collection, { name })
            .then(documentId => {
                id = documentId;
                return this.engine.readOne(User.collection, id);
            })
            .then(document => {
                expect(document).toEqual({ name });
            });
    }

    public testReadOneNonExistent(): void {
        expect(this.engine.readOne(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

    public testReadMany(): Promise<void> {
        let otherCollection;

        do {
            otherCollection = Faker.lorem.word();
        } while (User.collection === otherCollection);

        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static collection = otherCollection;
        }

        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        const ids: string[] = [];

        return Promise.all([
            this.engine.create(User.collection, { name: firstName }).then(id => ids.push(id)),
            this.engine.create(User.collection, { name: secondName }).then(id => ids.push(id)),
            this.engine.create(StubModel.collection, { name: Faker.name.firstName() }),
        ])
            .then(() => this.engine.readMany(User.collection))
            .then(documents => {
                expect(Object.values(documents)).toHaveLength(2);
                expect(documents[ids[0]]).toEqual({ name: firstName });
                expect(documents[ids[1]]).toEqual({ name: secondName });
            });
    }

    public async testReadManyFilters(): Promise<void> {
        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        await this.engine.create(User.collection, { name: firstName });
        const id = await this.engine.create(User.collection, { name: secondName });

        const documents = await this.engine.readMany(User.collection, { name: secondName });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name: secondName });
    }

    public testUpdate(): Promise<void> {
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        let id;

        return this.engine.create(User.collection, { name: initialName, surname: Faker.name.lastName() })
            .then(documentId => {
                id = documentId;
                return this.engine.update(User.collection, id, { name: newName }, ['surname']);
            })
            .then(() => {
                expect(this.engine.database[User.collection][id]).toEqual({ name: newName });
            });
    }

    public testUpdateNonExistent(): void {
        expect(this.engine.update(User.collection, Faker.random.uuid(), {}, [])).rejects.toThrow(DocumentNotFound);
    }

    public testDelete(): Promise<void> {
        return this.engine.create(User.collection, { name: Faker.name.firstName() })
            .then(id => this.engine.delete(User.collection, id))
            .then(() => {
                expect(Object.keys(this.engine.database[User.collection])).toHaveLength(0);
            });
    }

    public testDeleteNonExistent(): void {
        expect(this.engine.delete(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

}

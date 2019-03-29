import Faker from 'faker';

import Model from '@/lib/Model';

import InMemoryEngine from '@/lib/engines/InMemoryEngine';

import DocumentNotFound from '@/lib/errors/DocumentNotFound';

import TestSuite from '../TestSuite';

import StubModel from '../stubs/StubModel';

export default class extends TestSuite {

    public static title: string = 'InMemory';

    private engine: InMemoryEngine;

    public setUp(): void {
        StubModel.load();
        this.engine = new InMemoryEngine();
    }

    public testCreate(): Promise<void> {
        const name = Faker.name.firstName();

        return this.engine.create(StubModel, { name }).then(id => {
            expect(this.engine.database).toHaveProperty(StubModel.collection);
            expect(this.engine.database[StubModel.collection].documents).toHaveProperty(id);
            expect(Object.keys(this.engine.database[StubModel.collection].documents)).toHaveLength(1);
            expect(this.engine.database[StubModel.collection].documents[id]).toEqual({ id, name });
        });
    }

    public testReadOne(): Promise<void> {
        const name = Faker.name.firstName();

        let id;

        return this.engine.create(StubModel, { name })
            .then(documentId => {
                id = documentId;
                return this.engine.readOne(StubModel, id);
            })
            .then(document => {
                expect(document).toEqual({ id, name });
            });
    }

    public testReadOneNonExistent(): void {
        expect(this.engine.readOne(StubModel, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

    public testReadMany(): Promise<void> {
        let otherCollection;

        do {
            otherCollection = Faker.lorem.word();
        } while(StubModel.collection === otherCollection);

        // tslint:disable-next-line:max-classes-per-file
        class OtherModel extends Model {
            public static collection = otherCollection;
        }

        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        return Promise.all([
            this.engine.create(StubModel, { name: firstName }),
            this.engine.create(StubModel, { name: secondName }),
            this.engine.create(OtherModel, { name: Faker.name.firstName() }),
        ])
            .then(() => this.engine.readMany(StubModel))
            .then(documents => {
                expect(documents).toHaveLength(2);
                expect(documents[0]).toEqual({ id: documents[0].id, name: firstName });
                expect(documents[1]).toEqual({ id: documents[1].id, name: secondName });
            });
    }

    public testUpdate(): Promise<void> {
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        let id;

        return this.engine.create(StubModel, { name: initialName, surname: Faker.name.lastName() })
            .then(documentId => {
                id = documentId;
                return this.engine.update(StubModel, id, { name: newName }, ['surname']);
            })
            .then(() => {
                expect(this.engine.database[StubModel.collection].documents[id]).toEqual({ id, name: newName });
            });
    }

    public testUpdateNonExistent(): void {
        expect(this.engine.update(StubModel, Faker.random.uuid(), {}, [])).rejects.toThrow(DocumentNotFound);
    }

    public testDelete(): Promise<void> {
        return this.engine.create(StubModel, { name: Faker.name.firstName() })
            .then(id => this.engine.delete(StubModel, id))
            .then(() => {
                expect(Object.keys(this.engine.database[StubModel.collection].documents)).toHaveLength(0);
            });
    }

    public testDeleteNonExistent(): void {
        expect(this.engine.delete(StubModel, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

}

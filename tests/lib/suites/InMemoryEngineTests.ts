import Faker from 'faker';

import TestSuite from '../TestSuite';

import DocumentNotFound from '../../../src/lib/errors/DocumentNotFound';
import InMemoryEngine from '../../../src/lib/engines/InMemoryEngine';

export default class extends TestSuite {

    static title: string = 'InMemory';

    private engine: InMemoryEngine;

    public setUp(): void {
        this.engine = new InMemoryEngine();
    }

    public testCreate(): Promise<void> {
        const collection = Faker.lorem.word();
        const name = Faker.name.firstName();

        return this.engine.create(collection, { name }).then(id => {
            expect(this.engine.database).toHaveProperty(collection);
            expect(this.engine.database[collection].documents).toHaveProperty(id);
            expect(Object.keys(this.engine.database[collection].documents)).toHaveLength(1);
            expect(this.engine.database[collection].documents[id]).toEqual({ id, name });
        });
    }

    public testReadOne(): Promise<void> {
        const collection = Faker.lorem.word();
        const name = Faker.name.firstName();

        let id;

        return this.engine.create(collection, { name })
            .then(documentId => {
                id = documentId;
                return this.engine.readOne(collection, id);
            })
            .then(document => {
                expect(document).toEqual({ id, name });
            });
    }

    public testReadOneNonExistent(): void {
        expect(this.engine.readOne(Faker.lorem.word(), Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

    public testReadMany(): Promise<void> {
        const collection = Faker.lorem.word();
        const firstName = Faker.name.firstName();
        const secondName = Faker.name.firstName();

        return Promise.all([
            this.engine.create(collection, { name: firstName }),
            this.engine.create(collection, { name: secondName }),
            this.engine.create(Faker.lorem.word(), { name: Faker.name.firstName() }),
        ])
            .then(() => this.engine.readMany(collection))
            .then(documents => {
                expect(documents).toHaveLength(2);
                expect(documents[0]).toEqual({ id: documents[0].id, name: firstName });
                expect(documents[1]).toEqual({ id: documents[1].id, name: secondName });
            });
    }

    public testUpdate(): Promise<void> {
        const collection = Faker.lorem.word();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        let id;

        return this.engine.create(collection, { name: initialName, surname: Faker.name.lastName() })
            .then(documentId => {
                id = documentId;
                return this.engine.update(collection, id, { name: newName }, ['surname']);
            })
            .then(() => {
                expect(this.engine.database[collection].documents[id]).toEqual({ id, name: newName });
            });
    }

    public testUpdateNonExistent(): void {
        expect(this.engine.update(Faker.lorem.word(), Faker.random.uuid(), {}, [])).rejects.toThrow(DocumentNotFound);
    }

    public testDelete(): Promise<void> {
        const collection = Faker.lorem.word();

        return this.engine.create(collection, { name: Faker.name.firstName() })
            .then(id => this.engine.delete(collection, id))
            .then(() => {
                expect(Object.keys(this.engine.database[collection].documents)).toHaveLength(0);
            });
    }

    public testDeleteNonExistent(): void {
        expect(this.engine.delete(Faker.lorem.word(), Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

}

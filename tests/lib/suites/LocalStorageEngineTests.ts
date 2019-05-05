import Faker from 'faker';

import LocalStorageEngine from '@/engines/LocalStorageEngine';

import DocumentNotFound from '@/errors/DocumentNotFound';

import TestSuite from '../TestSuite';

import MockLocalStorage from '../mocks/MockLocalStorage';

import User from '../stubs/User';

export default class extends TestSuite {

    public static title: string = 'LocalStorage';

    private engine: LocalStorageEngine;

    private prefix: string;

    public setUp(): void {
        User.load();
        this.engine = new LocalStorageEngine(this.prefix = Faker.random.word());

        MockLocalStorage.reset();

        (window as any).localStorage = MockLocalStorage;
    }

    public testCreate(): Promise<void> {
        const name = Faker.name.firstName();

        return this.engine.create(User.collection, { name }).then(id => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                this.prefix + User.collection,
                JSON.stringify({ [id]: { name} }),
            );
        });
    }

    public testReadOne(): Promise<void> {
        const name = Faker.name.firstName();
        const id = Faker.random.uuid();

        MockLocalStorage.setData({
            [this.prefix + User.collection]: JSON.stringify({
                [id]: { name },
            }),
        });

        return this.engine.readOne(User.collection, id).then(document => {
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

        const firstId = Faker.random.uuid();
        const firstName = Faker.name.firstName();
        const secondId = Faker.random.uuid();
        const secondName = Faker.name.firstName();

        MockLocalStorage.setData({
            [this.prefix + User.collection]: JSON.stringify({
                [firstId]: { name: firstName },
                [secondId]: { name: secondName },
            }),
            [this.prefix + otherCollection]: JSON.stringify({
                [Faker.random.uuid()]: { name: Faker.name.firstName() },
            }),
        });

        return this.engine.readMany(User.collection).then(documents => {
            expect(Object.values(documents)).toHaveLength(2);
            expect(documents[firstId]).toEqual({ name: firstName });
            expect(documents[secondId]).toEqual({ name: secondName });
        });
    }

    public async testReadManyFilters(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        MockLocalStorage.setData({
            [this.prefix + User.collection]: JSON.stringify({
                [Faker.random.uuid()]: { name: Faker.name.firstName() },
                [id]: { name },
            }),
        });

        const documents = await this.engine.readMany(User.collection, { name });

        expect(Object.values(documents)).toHaveLength(1);
        expect(documents[id]).toEqual({ name });
    }

    public testUpdate(): Promise<void> {
        const id = Faker.random.uuid();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        MockLocalStorage.setData({
            [this.prefix + User.collection]: JSON.stringify({
                [id]: { name: initialName, surname: Faker.name.lastName() },
            }),
        });

        return this.engine.update(User.collection, id, { name: newName }, ['surname']).then(() => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledTimes(1);
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                this.prefix + User.collection,
                JSON.stringify({
                    [id]: { name: newName },
                }),
            );
        });
    }

    public testUpdateNonExistent(): void {
        expect(this.engine.update(User.collection, Faker.random.uuid(), {}, [])).rejects.toThrow(DocumentNotFound);
    }

    public testDelete(): Promise<void> {
        const firstId = Faker.random.uuid();
        const secondId = Faker.random.uuid();
        const name = Faker.name.firstName();

        MockLocalStorage.setData({
            [this.prefix + User.collection]: JSON.stringify({
                [firstId]: { name: Faker.name.firstName() },
                [secondId]: { name },
            }),
        });

        return this.engine.delete(User.collection, firstId).then(() => {
            expect(MockLocalStorage.setItem).toHaveBeenCalledWith(
                this.prefix + User.collection,
                JSON.stringify({
                    [secondId]: { name },
                }),
            );
        });
    }

    public testDeleteNonExistent(): void {
        expect(this.engine.delete(User.collection, Faker.random.uuid())).rejects.toThrow(DocumentNotFound);
    }

}

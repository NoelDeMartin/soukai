import Faker from 'faker';

import TestSuite from '../TestSuite';
import MockEngine from '../mocks/MockEngine';

import Model from '../../../src/lib/Model';
import Soukai from '../../../src/lib/Soukai';
import Engine from '../../../src/lib/Engine';

class StubModel extends Model {
    static collection = Faker.lorem.word();
}

export default class extends TestSuite {

    static title: string = 'CRUD';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
        Soukai.loadModel('Stub', StubModel);
    }

    public testCreate(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { name };

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create(attributes).then(model => {
            expect(model).toBeInstanceOf(StubModel);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(StubModel.collection, attributes);
        });
    }

    public testFind(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({ id, name }));

        return StubModel.find(id).then(model => {
            expect(model).toBeInstanceOf(StubModel);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readOne).toHaveBeenCalledWith(StubModel.collection, id);
        });
    }

    public testDontFind(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.readOne.mockReturnValue(Promise.reject(null));

        return StubModel.find(id).then(model => {
            expect(model).toBe(null);
            expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readOne).toHaveBeenCalledWith(StubModel.collection, id);
        });
    }

    public testAll(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.readMany.mockReturnValue(Promise.resolve([{ id, name }]));

        return StubModel.all().then(models => {
            expect(models).toHaveLength(1);
            expect(models[0]).toBeInstanceOf(StubModel);
            expect(models[0].id).toBe(id);
            expect(models[0].name).toBe(name);
            expect(this.mockEngine.readMany).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readMany).toHaveBeenCalledWith(StubModel.collection);
        });
    }

    public testUpdate(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: initialName, surname })
            .then(model => model.update({ name: newName }))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(StubModel.collection, id, { name: newName }, []);
            });
    }

    public testSetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: initialName, surname })
            .then(model => {
                model.setAttribute('name', newName);
                return model.save();
            })
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(StubModel.collection, id, { name: newName }, []);
            });
    }

    public testUnsetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name, surname: Faker.name.lastName() })
            .then(model => {
                model.unsetAttribute('surname');
                return model.save();
            })
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(StubModel.collection, id, {}, ['surname']);
            });
    }

    public testDelete(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name })
            .then(model => model.delete())
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBeUndefined();
                expect(model.name).toBe(name);
                expect(this.mockEngine.delete).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.delete).toHaveBeenCalledWith(StubModel.collection, id);
            });
    }

}

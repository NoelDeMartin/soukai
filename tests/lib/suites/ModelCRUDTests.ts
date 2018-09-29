import Faker from 'faker';

import Engine from '@/lib/Engine';
import Model from '@/lib/Model';
import Soukai from '@/lib/Soukai';

import SoukaiError from '@/lib/errors/SoukaiError';

import TestSuite from '../TestSuite';
import { seconds, wait } from '../utils';

import StubModel from '../stubs/StubModel';

import MockEngine from '../mocks/MockEngine';

export default class extends TestSuite {

    public static title: string = 'CRUD';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        StubModel.load();
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
    }

    public testCreate(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create(attributes).then(model => {
            expect(model).toBeInstanceOf(StubModel);
            expect(model.existsInDatabase()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.created_at).toBeInstanceOf(Date);
            expect(now - seconds(model.created_at)).toBeLessThan(1);
            expect(model.updated_at).toBeInstanceOf(Date);
            expect(now - seconds(model.updated_at)).toBeLessThan(1);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(
                StubModel,
                {
                    ...attributes,
                    ...{
                        created_at: seconds(model.created_at.getTime(), true),
                        updated_at: seconds(model.updated_at.getTime(), true),
                    },
                },
            );
        });
    }

    public testCreateInstance(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        const model = new StubModel(attributes);

        return model.save().then(() => {
            expect(model).toBeInstanceOf(StubModel);
            expect(model.existsInDatabase()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.created_at).toBeInstanceOf(Date);
            expect(now - seconds(model.created_at)).toBeLessThan(1);
            expect(model.updated_at).toBeInstanceOf(Date);
            expect(now - seconds(model.updated_at)).toBeLessThan(1);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(
                StubModel,
                {
                    ...attributes,
                    ...{
                        created_at: seconds(model.created_at.getTime(), true),
                        updated_at: seconds(model.updated_at.getTime(), true),
                    },
                },
            );
        });
    }

    public testSaveWithoutRequiredAttribute(): void {
        const createModel = () => StubModel.create();
        expect(createModel).toThrow(SoukaiError);
        expect(createModel).toThrow('The name attribute is required');
    }

    public testRemoveRequiredAttribute(): Promise<void> {
        this.mockEngine.create.mockReturnValue(Promise.resolve(Faker.random.uuid()));

        return StubModel.create({ name: Faker.name.firstName() })
            .then(model => wait().then(() => {
                model.unsetAttribute('name');

                const saveModel = () => model.save();
                expect(saveModel).toThrow(SoukaiError);
                expect(saveModel).toThrow('The name attribute is required');
            }));
    }

    public testFind(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const birthDate = seconds(Date.now(), true);

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({ id, name, birth_date: birthDate }));

        return StubModel.find(id).then(model => {
            expect(model).not.toBeNull();
            expect(model).toBeInstanceOf(StubModel);
            if (model !== null) {
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.birth_date).toBeInstanceOf(Date);
                expect(seconds(model.birth_date, true)).toEqual(birthDate);
                expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.readOne).toHaveBeenCalledWith(StubModel, id);
            }
        });
    }

    public testFindRespectsEmptyValues(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name: Faker.name.firstName(),
            birth_date: null,
        }));

        return StubModel.find(id).then(model => {
            expect(model).not.toBeNull();
            if (model !== null) {
                expect(model.birth_date).toBeNull();
            }
        });
    }

    public testDontFind(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.readOne.mockReturnValue(Promise.reject(null));

        return StubModel.find(id).then(model => {
            expect(model).toBe(null);
            expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readOne).toHaveBeenCalledWith(StubModel, id);
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
            expect(this.mockEngine.readMany).toHaveBeenCalledWith(StubModel);
        });
    }

    public testUpdate(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: initialName, surname })
            .then(model => wait().then(() => model.update({ name: newName })))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updated_at).toBeInstanceOf(Date);
                expect(now - seconds(model.updated_at)).toBeLessThan(1);
                expect(model.updated_at.getTime()).toBeGreaterThan(model.created_at.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    StubModel,
                    id,
                    {
                        name: newName,
                        updated_at: seconds(model.updated_at.getTime(), true),
                    },
                    [],
                );
            });
    }

    public testUpdateRespectsEmptyValues(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: Faker.name.firstName(), birth_date: null })
            .then(model => wait().then(() => model.update({ name: Faker.name.firstName() })))
            .then(model => {
                expect(model.birth_date).toBeNull();
            });
    }

    public testSetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: initialName, surname })
            .then(model => wait().then(() => {
                model.setAttribute('name', newName);
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updated_at).toBeInstanceOf(Date);
                expect(now - seconds(model.updated_at)).toBeLessThan(1);
                expect(model.updated_at.getTime()).toBeGreaterThan(model.created_at.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    StubModel,
                    id,
                    {
                        name: newName,
                        updated_at: seconds(model.updated_at.getTime(), true),
                    },
                    [],
                );
            });
    }

    public testUnsetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name, surname: Faker.name.lastName() })
            .then(model => wait().then(() => {
                model.unsetAttribute('surname');
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(model.updated_at).toBeInstanceOf(Date);
                expect(now - seconds(model.updated_at)).toBeLessThan(1);
                expect(model.updated_at.getTime()).toBeGreaterThan(model.created_at.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    StubModel,
                    id,
                    { updated_at: seconds(model.updated_at.getTime(), true) },
                    ['surname'],
                );
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
                expect(model.existsInDatabase()).toBe(false);
                expect(this.mockEngine.delete).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.delete).toHaveBeenCalledWith(StubModel, id);
            });
    }

    public testThrowEngineMissingError(): void {
        Soukai.useEngine(null as any);

        const createModel = () => StubModel.create({ name: Faker.name.firstName() });
        expect(createModel).toThrow(SoukaiError);
        expect(createModel).toThrow('Engine must be initialized before performing any operations');
    }

    public testThrowModelNotBootedErrorOnConstructor(): void {
        // tslint:disable-next-line:max-classes-per-file
        class NonBootedModel extends Model {
        }

        const createInstance = () => new NonBootedModel();
        expect(createInstance).toThrow(SoukaiError);
        expect(createInstance).toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

    public testThrowModelNotBootedErrorOnAll(): void {
        // tslint:disable-next-line:max-classes-per-file
        class NonBootedModel extends Model {
        }

        const retrieveAll = () => NonBootedModel.all();
        expect(retrieveAll).toThrow(SoukaiError);
        expect(retrieveAll).toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

    public testThrowModelNotBootedErrorOnFind(): void {
        // tslint:disable-next-line:max-classes-per-file
        class NonBootedModel extends Model {
        }

        const findOne = () => NonBootedModel.find(Faker.random.uuid());
        expect(findOne).toThrow(SoukaiError);
        expect(findOne).toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

}

import Faker from 'faker';

import { Engine } from '@/engines/Engine';
import { Model } from '@/models/Model';
import Soukai from '@/Soukai';

import SoukaiError from '@/errors/SoukaiError';

import TestSuite from '../TestSuite';
import { seconds, wait } from '../utils';

import Post from '../stubs/Post';
import User from '../stubs/User';

import MockEngine from '../mocks/MockEngine';

export default class extends TestSuite {

    public static title: string = 'CRUD';

    private mockEngine!: jest.Mocked<Engine>;

    public setUp(): void {
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
        Soukai.loadModels({ User, Post });
    }

    public testCreate(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create(attributes).then(model => {
            expect(model).toBeInstanceOf(User);
            expect(model.exists()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.createdAt).toBeInstanceOf(Date);
            expect(now - seconds(model.createdAt)).toBeLessThan(1);
            expect(model.updatedAt).toBeInstanceOf(Date);
            expect(now - seconds(model.updatedAt)).toBeLessThan(1);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(
                User.collection,
                {
                    ...attributes,
                    ...{
                        createdAt: model.createdAt,
                        updatedAt: model.updatedAt,
                    },
                },
                undefined,
            );
        });
    }

    public testCreateInstance(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        const model = new User(attributes);

        return model.save().then(() => {
            expect(model).toBeInstanceOf(User);
            expect(model.exists()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.createdAt).toBeInstanceOf(Date);
            expect(now - seconds(model.createdAt)).toBeLessThan(1);
            expect(model.updatedAt).toBeInstanceOf(Date);
            expect(now - seconds(model.updatedAt)).toBeLessThan(1);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(
                User.collection,
                {
                    ...attributes,
                    ...{
                        createdAt: model.createdAt,
                        updatedAt: model.updatedAt,
                    },
                },
                undefined,
            );
        });
    }

    public testCreateInstanceWithId(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const attributes = { id, name };
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        const model = new User(attributes);

        return model.save().then(() => {
            expect(model).toBeInstanceOf(User);
            expect(model.exists()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.createdAt).toBeInstanceOf(Date);
            expect(now - seconds(model.createdAt)).toBeLessThan(1);
            expect(model.updatedAt).toBeInstanceOf(Date);
            expect(now - seconds(model.updatedAt)).toBeLessThan(1);
            expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.create).toHaveBeenCalledWith(
                User.collection,
                {
                    ...attributes,
                    ...{
                        createdAt: model.createdAt,
                        updatedAt: model.updatedAt,
                    },
                },
                id,
            );
        });
    }

    public testSaveWithoutRequiredAttribute(): void {
        const createModel = () => User.create();
        expect(createModel()).rejects.toThrow(SoukaiError);
        expect(createModel()).rejects.toThrow('The name attribute is required');
    }

    public testRemoveRequiredAttribute(): Promise<void> {
        this.mockEngine.create.mockReturnValue(Promise.resolve(Faker.random.uuid()));

        return User.create({ name: Faker.name.firstName() })
            .then(model => wait().then(() => {
                model.unsetAttribute('name');

                const saveModel = () => model.save();
                expect(saveModel()).rejects.toThrow(SoukaiError);
                expect(saveModel()).rejects.toThrow('The name attribute is required');
            }));
    }

    public testFind(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const birthDate = seconds(Date.now(), true);

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name,
            birthDate: birthDate * 1000,
        }));

        return User.find(id).then(model => {
            expect(model).not.toBeNull();
            expect(model).toBeInstanceOf(User);
            if (model !== null) {
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.birthDate).toBeInstanceOf(Date);
                expect(seconds(model.birthDate, true)).toEqual(birthDate);
                expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
            }
        });
    }

    public testFindRespectsEmptyValues(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name: Faker.name.firstName(),
            birthDate: null,
        }));

        return User.find(id).then(model => {
            expect(model).not.toBeNull();
            if (model !== null) {
                expect(model.birthDate).toBeNull();
            }
        });
    }

    public testDontFind(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.readOne.mockReturnValue(Promise.reject(null));

        return User.find(id).then(model => {
            expect(model).toBe(null);
            expect(this.mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
        });
    }

    public testAll(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.readMany.mockReturnValue(Promise.resolve({ [id]: { id, name } }));

        return User.all().then(models => {
            expect(models).toHaveLength(1);
            expect(models[0]).toBeInstanceOf(User);
            expect(models[0].id).toBe(id);
            expect(models[0].name).toBe(name);
            expect(this.mockEngine.readMany).toHaveBeenCalledTimes(1);
            expect(this.mockEngine.readMany).toHaveBeenCalledWith(User.collection, undefined);
        });
    }

    public testUpdate(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => wait().then(() => model.update({ name: newName })))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
                    },
                );
            });
    }

    public testUpdateRespectsEmptyValues(): Promise<void> {
        const id = Faker.random.uuid();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: Faker.name.firstName(), birthDate: null })
            .then(model => wait().then(() => model.update({ name: Faker.name.firstName() })))
            .then(model => {
                expect(model.birthDate).toBeNull();
            });
    }

    public testSetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => wait().then(() => {
                model.setAttribute('name', newName);
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
                    },
                );
            });
    }

    public testUnsetAttribute(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name, surname: Faker.name.lastName() })
            .then(model => wait().then(() => {
                model.unsetAttribute('surname');
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    { updatedAt: model.updatedAt, surname: { $unset: true } },
                );
            });
    }

    public testDelete(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name })
            .then(model => model.delete())
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBeUndefined();
                expect(model.name).toBe(name);
                expect(model.exists()).toBe(false);
                expect(this.mockEngine.delete).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.delete).toHaveBeenCalledWith(User.collection, id);
            });
    }

    public testThrowEngineMissingError(): void {
        Soukai.useEngine(null as any);

        const createModel = () => User.create({ name: Faker.name.firstName() });
        expect(createModel()).rejects.toThrow(SoukaiError);
        expect(createModel()).rejects.toThrow('Engine must be initialized before performing any operations');
    }

    public testThrowModelNotBootedErrorOnConstructor(): void {
        class NonBootedModel extends Model {
        }

        const createInstance = () => new NonBootedModel();
        expect(createInstance).toThrow(SoukaiError);
        expect(createInstance).toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

    public testThrowModelNotBootedErrorOnAll(): void {
        class NonBootedModel extends Model {
        }

        const retrieveAll = () => NonBootedModel.all();
        expect(retrieveAll()).rejects.toThrow(SoukaiError);
        expect(retrieveAll()).rejects.toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

    public testThrowModelNotBootedErrorOnFind(): void {
        class NonBootedModel extends Model {
        }

        const findOne = () => NonBootedModel.find(Faker.random.uuid());
        expect(findOne).toThrow(SoukaiError);
        expect(findOne).toThrow('Model has not been booted (did you forget to call Soukai.loadModel?)');
    }

}

import { faker } from '@noeldemartin/faker';
import { after, seconds, tt } from '@noeldemartin/utils';
import type { Assert, Equals, Expect, Extends, HasKey , Not } from '@noeldemartin/utils';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import { FieldType, Model, TimestampField, bootModels, defineModelSchema } from '@/models/index';
import { InMemoryEngine, setEngine } from '@/engines';
import { SoukaiError } from '@/errors';
import type { Engine } from '@/engines/Engine';
import type { Key, ModelCastAttributeOptions, TimestampFieldValue } from '@/models/index';

import City from '@/testing/stubs/City';
import MockEngine from '@/testing/mocks/MockEngine';
import Post from '@/testing/stubs/Post';
import User from '@/testing/stubs/User';

describe('Model', () => {

    let mockEngine: jest.Mocked<Engine>;

    beforeEach(() => {
        MockEngine.mockClear();

        setEngine(mockEngine = new MockEngine());
        bootModels({ User, Post, City });
    });

    it('deletes related models with cascade delete mode', async () => {
        // Arrange
        const userId = faker.datatype.uuid();
        const postId = faker.datatype.uuid();
        const user = new User({ id: userId }, true);
        const post = new Post({ id: postId }, true);

        user.setRelationModels('posts', [post]);

        // Act
        await user.delete();

        // Assert
        expect(mockEngine.delete).toHaveBeenCalledTimes(2);
        expect(mockEngine.delete).toHaveBeenCalledWith(User.collection, userId);
        expect(mockEngine.delete).toHaveBeenCalledWith(Post.collection, postId);

        expect(user.exists()).toBe(false);
        expect(user.id).toBeUndefined();
        expect(post.exists()).toBe(false);
        expect(post.id).toBeUndefined();
    });

    it('emits events', async () => {
        // Arrange
        let createCount = 0;
        let updateCount = 0;
        let deleteCount = 0;

        Post.on('created', () => createCount++);
        Post.on('updated', () => updateCount++);
        Post.on('deleted', () => deleteCount++);

        // Act
        const post = await Post.create({ title: faker.random.words() });

        post.update({ title: faker.random.words() });
        post.update({ title: faker.random.words() });
        post.update({ title: faker.random.words() });

        await Post.create({ title: faker.random.words() });
        await post.delete();

        // Assert
        expect(createCount).toBe(2);
        expect(updateCount).toBe(3);
        expect(deleteCount).toBe(1);
    });

    it('overrides engine', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const id = faker.datatype.uuid();
        const originalName = faker.random.words();
        const updatedName = faker.random.words();

        engine.create(User.collection, { id, name: originalName }, id);
        engine.create(User.collection, { name: faker.random.words() });

        // Act
        const user = await User.withEngine(engine).find(id);
        const users = await User.withEngine(engine).all();

        await user?.withEngine(engine).update({ name: updatedName });

        // Assert
        expect(users).toHaveLength(2);
        expect(user).not.toBeNull();
        expect(user?.id).toEqual(id);
        expect(user?.name).toEqual(updatedName);

        expect(User.getEngine()).not.toBe(engine);
    });

});

describe('Models definition', () => {

    it('testInstanceOf', () => {
        class StubModel extends Model {}

        bootModels({ StubModel });

        expect(new StubModel()).toBeInstanceOf(StubModel);
    });

    it('testCollection', () => {
        class StubModel extends Model {

            public static collection = 'collection';

        }

        bootModels({ StubModel });

        expect(StubModel.collection).toBe('collection');
    });

    it('testEmptyCollection', () => {
        class StubModel extends Model {}

        bootModels({ stub: StubModel });

        expect(StubModel.collection).toBe('stubs');
    });

    it('testInheritedCollection', () => {
        class StubModel extends Model {

            public static collection = 'stubs';

        }

        class User extends StubModel {}
        class Admin extends User {}

        bootModels({ StubModel, User, Admin });

        expect(StubModel.collection).toBe('stubs');
        expect(User.collection).toBe('stubs');
        expect(Admin.collection).toBe('stubs');
    });

    it('testEmptyInheritedCollection', () => {
        class StubModel extends Model {}
        class User extends StubModel {}
        class Admin extends User {}

        bootModels({ stub: StubModel, User, Admin });

        expect(StubModel.collection).toBe('stubs');
        expect(User.collection).toBe('users');
        expect(Admin.collection).toBe('admins');
    });

    it('testTimestamps', () => {
        class StubModel extends Model {

            public static timestamps = [TimestampField.CreatedAt];

        }

        bootModels({ StubModel });

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
        });
    });

    it('Avoids clearing timestamps', async () => {
        // Arrange
        const StubSchema = defineModelSchema({});

        class StubModel extends StubSchema {}

        setEngine(new InMemoryEngine);
        bootModels({ StubModel });

        // Act
        const model = await StubModel.create({ createdAt: undefined, updatedAt: null });

        // Assert
        expect(model.createdAt).toBeInstanceOf(Date);
        expect(model.updatedAt).toBeInstanceOf(Date);
    });

    it('testEmptyTimestamps', () => {
        class StubModel extends Model {

            public static timestamps = false;

        }

        bootModels({ StubModel });

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
        });
    });

    it('testInvalidTimestamps', () => {
        class StubModel extends Model {

            public static timestamps = ['foobar'] as unknown as TimestampFieldValue[];

        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('Invalid timestamp field defined');
    });

    it('testFields', () => {
        class StubModel extends Model {

            public static fields = {
                name: {
                    type: FieldType.String,
                    required: true,
                },
                age: FieldType.Number,
                tags: {
                    type: FieldType.Array,
                    items: FieldType.String,
                },
                meta: {
                    type: FieldType.Object,
                    fields: {
                        birthDate: FieldType.Date,
                    },
                },
                cache: {
                    totalPosts: FieldType.Number,
                    totalFriends: FieldType.Number,
                },
            };

        }

        bootModels({ StubModel });

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            name: {
                type: FieldType.String,
                required: true,
            },
            age: {
                type: FieldType.Number,
                required: false,
            },
            tags: {
                type: FieldType.Array,
                required: false,
                items: {
                    type: FieldType.String,
                },
            },
            meta: {
                type: FieldType.Object,
                required: false,
                fields: {
                    birthDate: {
                        type: FieldType.Date,
                        required: false,
                    },
                },
            },
            cache: {
                type: FieldType.Object,
                required: false,
                fields: {
                    totalPosts: {
                        type: FieldType.Number,
                        required: false,
                    },
                    totalFriends: {
                        type: FieldType.Number,
                        required: false,
                    },
                },
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            updatedAt: {
                type: FieldType.Date,
                required: false,
            },
        });
    });

    it('testEmptyFields', () => {
        class StubModel extends Model {}

        bootModels({ StubModel });

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            updatedAt: {
                type: FieldType.Date,
                required: false,
            },
        });
    });

    it('testInvalidArrayField', () => {
        class StubModel extends Model {

            public static fields = {
                tags: FieldType.Array,
            };

        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('array requires items attribute');
    });

    it('testInvalidObjectField', () => {
        class StubModel extends Model {

            public static fields = {
                meta: FieldType.Object,
            };

        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('object requires fields attribute');
    });

    it('testInvalidTimestampField', () => {
        class StubModel extends Model {

            public static timestamps = [TimestampField.CreatedAt];

            public static fields = {
                createdAt: {
                    type: FieldType.Date,
                    required: true,
                },
            };

        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow(
            'Field createdAt definition must be type Date and not required because it is used an automatic timestamp',
        );
    });

    it('testAccessingClassProperties', () => {
        class StubModel extends Model {

            public myArray = [];

        }

        bootModels({ StubModel });

        const model = new StubModel();

        expect(model.myArray).toEqual([]);
    });

    it('testSettingClassProperties', () => {
        class StubModel extends Model {

            public myArray: string[] = [];

        }

        bootModels({ StubModel });

        const model = new StubModel();

        model.myArray = ['foobar'];

        expect(model.myArray).toEqual(['foobar']);
    });

    it('model names are calculated properly for children', () => {
        class Parent extends Model {}
        class ChildA extends Parent {}
        class ChildB extends Parent {}
        class ChildAA extends ChildA {

            public static modelName = 'CustomChildAA';

        }
        class ChildAB extends ChildA {}

        bootModels({ ChildA, ChildAA, ChildAB, ChildB, Parent });

        expect(Parent.modelName).toEqual('Parent');
        expect(ChildA.modelName).toEqual('ChildA');
        expect(ChildB.modelName).toEqual('ChildB');
        expect(ChildAA.modelName).toEqual('CustomChildAA');
        expect(ChildAB.modelName).toEqual('ChildAB');
    });

    it('class properties don\'t modify parent models', () => {
        class Parent extends Model {

            public static classFields = ['parentField'];
            public parentProp: string[] = [];

        }

        class Child extends Parent {

            public static classFields = ['childField'];
            public childProp: string[] = [];

        }

        bootModels({ Parent, Child });

        expect(Parent.classFields).toHaveLength(3);
        expect(Parent.classFields).toContain('_engine');
        expect(Parent.classFields).toContain('parentProp');
        expect(Parent.classFields).toContain('parentField');

        expect(Child.classFields).toHaveLength(5);
        expect(Child.classFields).toContain('_engine');
        expect(Child.classFields).toContain('parentProp');
        expect(Child.classFields).toContain('parentField');
        expect(Child.classFields).toContain('childProp');
        expect(Child.classFields).toContain('childField');
    });

});

describe('Models CRUD', () => {

    let mockEngine!: jest.Mocked<Engine>;

    beforeEach(() => {
        MockEngine.mockClear();

        setEngine(mockEngine = new MockEngine());
        bootModels({ User, Post });
    });

    it('testCreate', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create(attributes).then(model => {
            expect(model).toBeInstanceOf(User);
            expect(model.exists()).toBe(true);
            expect(model.id).toBe(id);
            expect(model.name).toBe(name);
            expect(model.createdAt).toBeInstanceOf(Date);
            expect(now - seconds(model.createdAt)).toBeLessThan(1);
            expect(model.updatedAt).toBeInstanceOf(Date);
            expect(now - seconds(model.updatedAt)).toBeLessThan(1);
            expect(mockEngine.create).toHaveBeenCalledTimes(1);
            expect(mockEngine.create).toHaveBeenCalledWith(
                User.collection,
                {
                    ...attributes,
                    externalUrls: [],
                    createdAt: model.createdAt,
                    updatedAt: model.updatedAt,
                },
                undefined,
            );
        });
    });

    it('testCreateInstance', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

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
            expect(mockEngine.create).toHaveBeenCalledTimes(1);
            expect(mockEngine.create).toHaveBeenCalledWith(
                User.collection,
                {
                    ...attributes,
                    externalUrls: [],
                    createdAt: model.createdAt,
                    updatedAt: model.updatedAt,
                },
                undefined,
            );
        });
    });

    it('creates instances with id', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const attributes = { id, name };
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        // Act
        const model = new User(attributes);

        await model.save();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.exists()).toBe(true);
        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.createdAt).toBeInstanceOf(Date);
        expect(now - seconds(model.createdAt)).toBeLessThan(1);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(mockEngine.create).toHaveBeenCalledTimes(1);
        expect(mockEngine.create).toHaveBeenCalledWith(
            User.collection,
            {
                ...attributes,
                externalUrls: [],
                createdAt: model.createdAt,
                updatedAt: model.updatedAt,
            },
            id,
        );
    });

    it('testSaveWithoutRequiredAttribute', () => {
        const createModel = () => User.create();
        expect(createModel()).rejects.toThrow(SoukaiError);
        expect(createModel()).rejects.toThrow('The name attribute is required');
    });

    it('testRemoveRequiredAttribute', async () => {
        mockEngine.create.mockReturnValue(Promise.resolve(faker.datatype.uuid()));

        return User.create({ name: faker.name.firstName() })
            .then(model => after().then(() => {
                model.unsetAttribute('name');

                const saveModel = () => model.save();
                expect(saveModel()).rejects.toThrow(SoukaiError);
                expect(saveModel()).rejects.toThrow('The name attribute is required');
            }));
    });

    it('testFind', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const birthDate = seconds(Date.now(), true);

        mockEngine.readOne.mockReturnValue(Promise.resolve({
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
                expect(mockEngine.readOne).toHaveBeenCalledTimes(1);
                expect(mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
            }
        });
    });

    it('testFindRespectsEmptyValues', async () => {
        const id = faker.datatype.uuid();

        mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name: faker.name.firstName(),
            birthDate: null,
        }));

        return User.find(id).then(model => {
            expect(model).not.toBeNull();
            if (model !== null) {
                expect(model.birthDate).toBeNull();
            }
        });
    });

    it('testDontFind', async () => {
        const id = faker.datatype.uuid();

        mockEngine.readOne.mockReturnValue(Promise.reject(null));

        return User.find(id).then(model => {
            expect(model).toBe(null);
            expect(mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
        });
    });

    it('testAll', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        mockEngine.readMany.mockReturnValue(Promise.resolve({ [id]: { id, name } }));

        return User.all().then(models => {
            expect(models).toHaveLength(1);

            const user = models[0] as User;
            expect(user).toBeInstanceOf(User);
            expect(user.id).toBe(id);
            expect(user.name).toBe(name);
            expect(mockEngine.readMany).toHaveBeenCalledTimes(1);
            expect(mockEngine.readMany).toHaveBeenCalledWith(User.collection, undefined);
        });
    });

    it('testUpdate', async () => {
        const id = faker.datatype.uuid();
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => after().then(() => model.update({ name: newName })))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(mockEngine.update).toHaveBeenCalledTimes(1);
                expect(mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
                    },
                );
            });
    });

    it('testUpdateRespectsEmptyValues', async () => {
        const id = faker.datatype.uuid();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: faker.name.firstName(), birthDate: null })
            .then(model => after().then(() => model.update({ name: faker.name.firstName() })))
            .then(model => {
                expect(model.birthDate).toBeNull();
            });
    });

    it('testSetAttribute', async () => {
        const id = faker.datatype.uuid();
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => after().then(() => {
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
                expect(mockEngine.update).toHaveBeenCalledTimes(1);
                expect(mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
                    },
                );
            });
    });

    it('testUnsetAttribute', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name, surname: faker.name.lastName() })
            .then(model => after().then(() => {
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
                expect(mockEngine.update).toHaveBeenCalledTimes(1);
                expect(mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    { updatedAt: model.updatedAt, surname: { $unset: true } },
                );
            });
    });

    it('testDelete', async () => {
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name })
            .then(model => model.delete())
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBeUndefined();
                expect(model.name).toBe(name);
                expect(model.exists()).toBe(false);
                expect(mockEngine.delete).toHaveBeenCalledTimes(1);
                expect(mockEngine.delete).toHaveBeenCalledWith(User.collection, id);
            });
    });

    it('testThrowEngineMissingError', () => {
        setEngine(null);

        const createModel = () => User.create({ name: faker.name.firstName() });
        expect(createModel()).rejects.toThrow(SoukaiError);
        expect(createModel()).rejects.toThrow('Engine must be initialized before performing any operations');
    });

});

describe('Model attributes', () => {

    let mockEngine!: jest.Mocked<Engine>;

    beforeEach(() => {
        MockEngine.mockClear();

        setEngine(mockEngine = new MockEngine());
        bootModels({ User });
    });

    it('custom getters work', () => {
        const user = new User({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expect(user.externalDomains).toEqual([]);
    });

    it('magic getters work', () => {
        const name = faker.name.firstName();
        const model = new User({ name });

        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
    });

    it('attribute getters work', () => {
        const name = faker.name.firstName();
        const model = new User({ name });

        expect(model.alias).toBe(name);
    });

    it('original attributes are casted', () => {
        // Arrange
        const Schema = defineModelSchema({
            fields: {
                date: FieldType.Date,
                numbers: {
                    type: FieldType.Array,
                    items: FieldType.Number,
                },
            },
        });

        class StubModel extends Schema {

            protected castAttribute(value: unknown, options: ModelCastAttributeOptions = {}): unknown {
                switch (options.definition?.type) {
                    case FieldType.Array:
                        return 'casted array';
                    case FieldType.Date:
                        return 'casted date';
                }

                return super.castAttribute(value, options);
            }

        }

        // Act
        const instance = new StubModel({
            date: new Date(),
            numbers: [],
        }, true);

        // Assert
        expect(instance.getAttribute('date')).toEqual('casted date');
        expect(instance.getOriginalAttribute('date')).toEqual('casted date');
        expect(instance.getAttribute('numbers')).toEqual('casted array');
        expect(instance.getOriginalAttribute('numbers')).toEqual('casted array');
    });

    it('fixes malformed attributes', async () => {
        // Arrange
        const id = faker.datatype.uuid();

        mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name: 'Alice',
            avatarUrl: 'https://example.org/avatar.png',
            externalUrls: [`https://a.example.org/users/${id}`, `https://b.example.org/users/${id}`],
            createdAt: new Date(),
            updatedAt: new Date(),
        }));

        // Act
        const user = await User.find(id) as User;
        const malformedAttributes = user.getMalformedDocumentAttributes();

        user.fixMalformedAttributes();

        await user.withoutTimestamps(() => user.save());

        // Assert
        expect(Object.keys(malformedAttributes)).toHaveLength(3);

        expect(mockEngine.update).toHaveBeenCalledTimes(1);
        expect(mockEngine.update).toHaveBeenCalledWith(
            User.collection,
            id,
            {
                avatarUrl: 'https://example.org/avatar.png',
                externalUrls: [`https://a.example.org/users/${id}`, `https://b.example.org/users/${id}`],
            },
        );
    });

    it('testAttributeSetter', async () => {
        const id = faker.datatype.uuid();
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => after().then(() => {
                model.name = newName;
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
                expect(mockEngine.update).toHaveBeenCalledTimes(1);
                expect(mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
                    },
                );
            });
    });

    it('testAttributeDeleter', async () => {
        // Arrange
        const id = faker.datatype.uuid();
        const name = faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        const user = await User.create({ name, surname: faker.name.lastName() });

        await after({ ms: 100 });

        // Act
        delete user.surname;

        await user.save();

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user.id).toBe(id);
        expect(user.name).toBe(name);
        expect(user.surname).toBeUndefined();
        expect(user.getAttributes(true)).toHaveProperty('surname');
        expect(user.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(user.updatedAt)).toBeLessThan(1);
        expect(user.updatedAt.getTime()).toBeGreaterThan(user.createdAt.getTime() + 10);
        expect(mockEngine.update).toHaveBeenCalledTimes(1);
        expect(mockEngine.update).toHaveBeenCalledWith(
            User.collection,
            id,
            { updatedAt: user.updatedAt, surname: { $unset: true } },
        );
    });

    it('testUndefinedAttributes', () => {
        const model = new User({ contact: { phone: faker.phone.number() } });

        expect(model.hasAttribute('name')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('name');
        expect(model.getAttributes(true)).toHaveProperty('name');
        expect(model.hasAttribute('contact')).toBe(true);
        expect(model.hasAttribute('contact.phone')).toBe(true);
        expect(model.hasAttribute('contact.email')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('contact.email');
        expect(model.getAttributes(true)).toHaveProperty('contact.email');
        expect(model.hasAttribute('social')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('social');
        expect(model.getAttributes(true)).toHaveProperty('social');
        expect(model.getAttributes(true)).toHaveProperty('social.website');
        expect(model.getAttributes(true)).toHaveProperty('social.mastodon');
        expect(model.hasAttribute('birthDate')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('birthDate');
        expect(model.getAttributes(true)).toHaveProperty('birthDate');
    });

    it('testSmartDirtyAttributesOnSetter', () => {
        const model = new User({
            name: faker.name.firstName(),
            surname: faker.name.lastName(),
            contact: { phone: faker.phone.number() },
        }, true);

        const originalSurname = model.surname;

        model.name = faker.name.firstName();
        model.surname = faker.name.lastName();
        model.surname = originalSurname;
        model.social = { mastodon: faker.internet.userName() };
        delete model.contact;

        expect(model.isDirty('name')).toBe(true);
        expect(model.isDirty('surname')).toBe(false);
        expect(model.isDirty('social')).toBe(true);
        expect(model.isDirty('contact')).toBe(true);
    });

    it('testSmartDirtyAttributesOnUpdate', async () => {
        // Arrange
        const model = new User({
            id: faker.datatype.uuid(),
            name: faker.name.firstName(),
            surname: faker.name.lastName(),
            contact: { phone: faker.phone.number() },
        }, true);

        mockEngine.create.mockReturnValue(Promise.resolve(''));

        // Act
        await model.update({
            name: faker.name.firstName(),
            surname: model.surname,
            social: { twitter: faker.internet.userName() },
            contact: undefined,
        });

        // Assert
        expect(mockEngine.update).toHaveBeenCalledTimes(1);
        expect(mockEngine.update).toHaveBeenCalledWith(
            User.collection,
            model.id,
            {
                name: model.name,
                social: model.social,
                createdAt: model.createdAt,
                updatedAt: model.updatedAt,
                contact: { $unset: true },
            },
        );
    });

});

describe('Model types', () => {

    it('infers magic attributes', tt<
        Expect<Equals<User['name'], string>> |
        Expect<Equals<User['surname'], string | undefined>> |
        Expect<Equals<User['age'], number | undefined>> |
        Expect<Equals<User['birthDate'], Date | undefined>> |
        Expect<Extends<User['contact'], undefined>> |
        Expect<Equals<Assert<User['contact']>['email'], string | undefined>> |
        Expect<Extends<User['social'], undefined>> |
        Expect<Equals<Assert<User['social']>['website'], string | undefined>> |
        Expect<Equals<User['externalUrls'], Key[]>> |
        Expect<Equals<User['createdAt'], Date>> |
        Expect<Equals<Post['title'], string>> |
        Expect<Equals<Pick<Post, 'title'>, { title: string }>> |
        Expect<Equals<City['name'], string>> |
        Expect<Equals<City['birthRecords'], Key[] | undefined>> |
        Expect<Equals<City['createdAt'], Date>> |
        Expect<Not<HasKey<City, 'updatedAt'>>> |
        Expect<Not<HasKey<User, 'undefinedProperty'>>> |
        true
    >());

});

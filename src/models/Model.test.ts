import { after, seconds, tt } from '@noeldemartin/utils';
import Faker from 'faker';
import type { Assert, Equals, Expect, Extends, Not } from '@noeldemartin/utils';

import { FieldType, Model, TimestampField, bootModels } from '@/models/index';
import { SoukaiError } from '@/errors';
import { setEngine } from '@/engines';
import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import type { Engine } from '@/engines/Engine';
import type { Key, TimestampFieldValue } from '@/models/index';

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
        const userId = Faker.random.uuid();
        const postId = Faker.random.uuid();
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

        const loadModel = () => bootModels({ StubModel });
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('Invalid timestamp field defined');
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

        const loadModel = () => bootModels({ StubModel });
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('array requires items attribute');
    });

    it('testInvalidObjectField', () => {
        class StubModel extends Model {

            public static fields = {
                meta: FieldType.Object,
            };

        }

        const loadModel = () => bootModels({ StubModel });
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('object requires fields attribute');
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

        const loadModel = () => bootModels({ StubModel });
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow(
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

        expect(Parent.classFields).toHaveLength(2);
        expect(Parent.classFields).toContain('parentProp');
        expect(Parent.classFields).toContain('parentField');

        expect(Child.classFields).toHaveLength(4);
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
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
        mockEngine.create.mockReturnValue(Promise.resolve(Faker.random.uuid()));

        return User.create({ name: Faker.name.firstName() })
            .then(model => after().then(() => {
                model.unsetAttribute('name');

                const saveModel = () => model.save();
                expect(saveModel()).rejects.toThrow(SoukaiError);
                expect(saveModel()).rejects.toThrow('The name attribute is required');
            }));
    });

    it('testFind', async () => {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
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
        const id = Faker.random.uuid();

        mockEngine.readOne.mockReturnValue(Promise.resolve({
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
    });

    it('testDontFind', async () => {
        const id = Faker.random.uuid();

        mockEngine.readOne.mockReturnValue(Promise.reject(null));

        return User.find(id).then(model => {
            expect(model).toBe(null);
            expect(mockEngine.readOne).toHaveBeenCalledTimes(1);
            expect(mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
        });
    });

    it('testAll', async () => {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

        mockEngine.readMany.mockReturnValue(Promise.resolve({ [id]: { id, name } }));

        return User.all().then(models => {
            expect(models).toHaveLength(1);
            expect(models[0]).toBeInstanceOf(User);
            expect(models[0].id).toBe(id);
            expect(models[0].name).toBe(name);
            expect(mockEngine.readMany).toHaveBeenCalledTimes(1);
            expect(mockEngine.readMany).toHaveBeenCalledWith(User.collection, undefined);
        });
    });

    it('testUpdate', async () => {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
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
        const id = Faker.random.uuid();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: Faker.name.firstName(), birthDate: null })
            .then(model => after().then(() => model.update({ name: Faker.name.firstName() })))
            .then(model => {
                expect(model.birthDate).toBeNull();
            });
    });

    it('testSetAttribute', async () => {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name, surname: Faker.name.lastName() })
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();

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

        const createModel = () => User.create({ name: Faker.name.firstName() });
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

    it('magic getters work', () => {
        const name = Faker.name.firstName();
        const model = new User({ name });

        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
    });

    it('attribute getters work', () => {
        const name = Faker.name.firstName();
        const model = new User({ name });

        expect(model.alias).toBe(name);
    });

    it('testAttributeSetter', async () => {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
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
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const now = seconds();

        mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name, surname: Faker.name.lastName() })
            .then(model => after().then(() => {
                delete model.surname;
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(model.getAttributes(true)).toHaveProperty('surname');
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

    it('testUndefinedAttributes', () => {
        const model = new User({ contact: { phone: Faker.phone.phoneNumber() } });

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
            name: Faker.name.firstName(),
            surname: Faker.name.lastName(),
            contact: { phone: Faker.phone.phoneNumber() },
        }, true);

        const originalSurname = model.surname;

        model.name = Faker.name.firstName();
        model.surname = Faker.name.lastName();
        model.surname = originalSurname;
        model.social = { mastodon: Faker.internet.userName() };
        delete model.contact;

        expect(model.isDirty('name')).toBe(true);
        expect(model.isDirty('surname')).toBe(false);
        expect(model.isDirty('social')).toBe(true);
        expect(model.isDirty('contact')).toBe(true);
    });

    it('testSmartDirtyAttributesOnUpdate', () => {
        const model = new User({
            id: Faker.random.uuid(),
            name: Faker.name.firstName(),
            surname: Faker.name.lastName(),
            contact: { phone: Faker.phone.phoneNumber() },
        }, true);

        mockEngine.create.mockReturnValue(Promise.resolve(''));

        model.update({
            name: Faker.name.firstName(),
            surname: model.surname,
            social: { twitter: Faker.internet.userName() },
            contact: undefined,
        });

        expect(mockEngine.update).toHaveBeenCalledTimes(1);
        expect(mockEngine.update).toHaveBeenCalledWith(
            User.collection,
            model.id,
            {
                name: model.name,
                social: model.social,
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
        Expect<Equals<User['externalUrls'], string[]>> |
        Expect<Equals<Post['title'], string>> |
        Expect<Equals<City['name'], string>> |
        Expect<Equals<City['birthRecords'], Key[]>> |
        Expect<Not<Extends<keyof User, 'undefinedProperty'>>> |
        true
    >());

});

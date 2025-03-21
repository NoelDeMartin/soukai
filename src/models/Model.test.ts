import { beforeEach, describe, expect, it } from 'vitest';

import { after, seconds, uuid } from '@noeldemartin/utils';
import { faker } from '@noeldemartin/faker';
import { tt } from '@noeldemartin/testing';
import type { Assert, Expect, Extends, HasKey, Not } from '@noeldemartin/testing';
import type { Equals } from '@noeldemartin/utils';

import InvalidModelDefinition from 'soukai/errors/InvalidModelDefinition';
import { FieldType, Model, TimestampField, bootModels, defineModelSchema } from 'soukai/models/index';
import { InMemoryEngine, setEngine } from 'soukai/engines';
import { SoukaiError } from 'soukai/errors';
import type { Key, ModelCastAttributeOptions, TimestampFieldValue } from 'soukai/models/index';

import City from 'soukai/testing/stubs/City';
import Post from 'soukai/testing/stubs/Post';
import User from 'soukai/testing/stubs/User';
import UserSchema from 'soukai/testing/stubs/User.schema';
import FakeEngine from 'soukai/testing/fakes/FakeEngine';

describe('Model', () => {

    beforeEach(() => {
        FakeEngine.reset();
        FakeEngine.use();

        bootModels({ User, Post, City });
    });

    it('deletes related models with cascade delete mode', async () => {
        // Arrange
        const userId = uuid();
        const postId = uuid();
        const user = new User({ id: userId }, true);
        const post = new Post({ id: postId }, true);

        FakeEngine.database[User.collection] = { [userId]: user.getAttributes() };
        FakeEngine.database[Post.collection] = { [postId]: post.getAttributes() };

        user.setRelationModels('posts', [post]);

        // Act
        await user.delete();

        // Assert
        expect(FakeEngine.delete).toHaveBeenCalledTimes(2);
        expect(FakeEngine.delete).toHaveBeenCalledWith(User.collection, userId);
        expect(FakeEngine.delete).toHaveBeenCalledWith(Post.collection, postId);

        expect(user.exists()).toBe(false);
        expect(user.id).toBeUndefined();
        expect(post.exists()).toBe(false);
        expect(post.id).toBeUndefined();
    });

    it('emits events', async () => {
        // Arrange
        const modifiedHistory: string[] = [];
        let createCount = 0;
        let updateCount = 0;
        let deleteCount = 0;

        Post.on('modified', (_, field) => modifiedHistory.push(field));
        Post.on('created', () => createCount++);
        Post.on('updated', () => updateCount++);
        Post.on('deleted', () => deleteCount++);

        // Act
        const post = await Post.create({ title: faker.random.words() });

        post.title = faker.random.words();
        post.title = faker.random.words();
        post.body = faker.lorem.paragraphs();

        await after({ ms: 10 });
        await post.update({ title: faker.random.words() });

        await after({ ms: 10 });
        await post.update({ title: faker.random.words() });

        await after({ ms: 10 });
        await post.update({ title: faker.random.words() });

        await after({ ms: 10 });
        await Post.create({ title: faker.random.words() });
        await post.delete();

        // Assert
        expect(modifiedHistory).toHaveLength(13);
        expect(modifiedHistory.filter((field) => field === 'title')).toHaveLength(5);
        expect(modifiedHistory.filter((field) => field === 'body')).toHaveLength(1);
        expect(modifiedHistory.filter((field) => field === 'createdAt')).toHaveLength(2);
        expect(modifiedHistory.filter((field) => field === 'updatedAt')).toHaveLength(5);
        expect(createCount).toBe(2);
        expect(updateCount).toBe(3);
        expect(deleteCount).toBe(1);
    });

    it('overrides engine', async () => {
        // Arrange
        const inMemoryEngine = new InMemoryEngine();
        const id = uuid();
        const originalName = faker.random.words();
        const updatedName = faker.random.words();

        await inMemoryEngine.create(User.collection, { id, name: originalName }, id);
        await inMemoryEngine.create(User.collection, { name: faker.random.words() });

        // Act
        const user = await User.withEngine(inMemoryEngine).find(id);
        const users = await User.withEngine(inMemoryEngine).all();

        await user?.withEngine(inMemoryEngine).update({ name: updatedName });

        // Assert
        expect(users).toHaveLength(2);
        expect(user).not.toBeNull();
        expect(user?.id).toEqual(id);
        expect(user?.name).toEqual(updatedName);

        expect(User.getEngine()).not.toBe(inMemoryEngine);
    });

});

describe('Models definition', () => {

    it('instanceOf', () => {
        class StubModel extends Model {}

        bootModels({ StubModel });

        expect(new StubModel()).toBeInstanceOf(StubModel);
    });

    it('collection', () => {
        class StubModel extends Model {

            public static collection = 'collection';
        
        }

        bootModels({ StubModel });

        expect(StubModel.collection).toBe('collection');
    });

    it('empty collection', () => {
        class StubModel extends Model {}

        bootModels({ stub: StubModel });

        expect(StubModel.collection).toBe('stubs');
    });

    it('inherited collection', () => {
        class StubModel extends Model {

            public static collection = 'stubs';
        
        }

        class Person extends StubModel {}
        class Admin extends Person {}

        bootModels({ StubModel, Person, Admin });

        expect(StubModel.collection).toBe('stubs');
        expect(Person.collection).toBe('stubs');
        expect(Admin.collection).toBe('stubs');
    });

    it('empty inherited collection', () => {
        class StubModel extends Model {}
        class Person extends StubModel {}
        class Admin extends Person {}

        bootModels({ stub: StubModel, Person, Admin });

        expect(StubModel.collection).toBe('stubs');
        expect(Person.collection).toBe('persons');
        expect(Admin.collection).toBe('admins');
    });

    it('timestamps', () => {
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

        setEngine(new InMemoryEngine());
        bootModels({ StubModel });

        // Act
        const model = await StubModel.create({ createdAt: undefined, updatedAt: null });

        // Assert
        expect(model.createdAt).toBeInstanceOf(Date);
        expect(model.updatedAt).toBeInstanceOf(Date);
    });

    it('empty timestamps', () => {
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

    it('invalid timestamps', () => {
        class StubModel extends Model {

            public static timestamps = ['foobar'] as unknown as TimestampFieldValue[];
        
        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('Invalid timestamp field defined');
    });

    it('fields', () => {
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

    it('empty fields', () => {
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

    it('invalid array field', () => {
        class StubModel extends Model {

            public static fields = {
                tags: FieldType.Array,
            };
        
        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('array requires items attribute');
    });

    it('invalid object field', () => {
        class StubModel extends Model {

            public static fields = {
                meta: FieldType.Object,
            };
        
        }

        const bootModel = () => bootModels({ StubModel });
        expect(bootModel).toThrow(InvalidModelDefinition);
        expect(bootModel).toThrow('object requires fields attribute');
    });

    it('invalid timestamp field', () => {
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

    it('accessing class properties', () => {
        class StubModel extends Model {

            public myArray = [];
        
        }

        bootModels({ StubModel });

        const model = new StubModel();

        expect(model.myArray).toEqual([]);
    });

    it('setting class properties', () => {
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

        expect(Parent.classFields).toHaveLength(4);
        expect(Parent.classFields).toContain('_engine');
        expect(Parent.classFields).toContain('_recentlyDeletedPrimaryKey');
        expect(Parent.classFields).toContain('parentProp');
        expect(Parent.classFields).toContain('parentField');

        expect(Child.classFields).toHaveLength(6);
        expect(Child.classFields).toContain('_engine');
        expect(Child.classFields).toContain('_recentlyDeletedPrimaryKey');
        expect(Child.classFields).toContain('parentProp');
        expect(Child.classFields).toContain('parentField');
        expect(Child.classFields).toContain('childProp');
        expect(Child.classFields).toContain('childField');
    });

});

describe('Models CRUD', () => {

    beforeEach(() => {
        FakeEngine.reset();
        FakeEngine.use();

        bootModels({ User, Post });
    });

    it('create', async () => {
        // Arrange
        const name = faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        // Act
        const model = await User.create(attributes);

        // Assert
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        expect(model).toBeInstanceOf(User);
        expect(model.exists()).toBe(true);
        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.createdAt).toBeInstanceOf(Date);
        expect(now - seconds(model.createdAt)).toBeLessThan(1);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(FakeEngine.create).toHaveBeenCalledTimes(1);
        expect(FakeEngine.create).toHaveBeenCalledWith(
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

    it('testCreateInstance', async () => {
        // Arrange
        const name = faker.name.firstName();
        const attributes = { name };
        const now = seconds();

        // Act
        const model = new User(attributes);

        await model.save();

        // Assert
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        expect(model).toBeInstanceOf(User);
        expect(model.exists()).toBe(true);
        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.createdAt).toBeInstanceOf(Date);
        expect(now - seconds(model.createdAt)).toBeLessThan(1);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(FakeEngine.create).toHaveBeenCalledTimes(1);
        expect(FakeEngine.create).toHaveBeenCalledWith(
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

    it('creates instances with id', async () => {
        // Arrange
        const id = uuid();
        const name = faker.name.firstName();
        const attributes = { id, name };
        const now = seconds();

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
        expect(FakeEngine.create).toHaveBeenCalledTimes(1);
        expect(FakeEngine.create).toHaveBeenCalledWith(
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

    it('save without required attribute', async () => {
        const createModel = () => User.create();
        await expect(createModel()).rejects.toThrow(SoukaiError);
        await expect(createModel()).rejects.toThrow('The name attribute is required');
    });

    it('remove required attribute', async () => {
        // Arrange
        const model = await User.create({ name: faker.name.firstName() });

        // Act
        model.unsetAttribute('name');

        // Assert
        const saveModel = () => model.save();
        await expect(saveModel()).rejects.toThrow(SoukaiError);
        await expect(saveModel()).rejects.toThrow('The name attribute is required');
    });

    it('testFind', async () => {
        // Arrange
        const id = uuid();
        const name = faker.name.firstName();
        const birthDate = seconds(Date.now(), true);

        FakeEngine.database[User.collection] = {
            [id]: {
                id,
                name,
                birthDate: birthDate * 1000,
            },
        };

        // Act
        const model = (await User.find(id)) as User;

        // Assert
        expect(model).not.toBeNull();
        expect(model).toBeInstanceOf(User);

        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.birthDate).toBeInstanceOf(Date);
        expect(seconds(model.birthDate, true)).toEqual(birthDate);
        expect(FakeEngine.readOne).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readOne).toHaveBeenCalledWith(User.collection, id);
    });

    it('find respects empty values', async () => {
        // Arrange
        const id = uuid();

        FakeEngine.database[User.collection] = {
            [id]: {
                id,
                name: faker.name.firstName(),
                birthDate: null,
            },
        };

        // Act
        const model = (await User.find(id)) as User;

        // Assert
        expect(model).not.toBeNull();
        expect(model.birthDate).toBeNull();
    });

    it('dont find', async () => {
        // Arrange
        const id = uuid();

        // Act
        const model = await User.find(id);

        // Assert
        expect(model).toBeNull();
        expect(FakeEngine.readOne).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readOne).toHaveBeenCalledWith(User.collection, id);
    });

    it('all', async () => {
        const id = uuid();
        const name = faker.name.firstName();

        FakeEngine.database[User.collection] = { [id]: { id, name } };

        const models = await User.all();
        expect(models).toHaveLength(1);

        const user = models[0] as User;
        expect(user).toBeInstanceOf(User);
        expect(user.id).toBe(id);
        expect(user.name).toBe(name);
        expect(FakeEngine.readMany).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readMany).toHaveBeenCalledWith(User.collection, undefined);
    });

    it('update', async () => {
        // Arrange
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();
        const model = await User.create({ name: initialName, surname });

        // Act
        await after({ ms: 100 });

        await model.update({ name: newName });

        // Assert
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        expect(model).toBeInstanceOf(User);
        expect(model.id).toBe(id);
        expect(model.name).toBe(newName);
        expect(model.surname).toBe(surname);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            name: newName,
            updatedAt: model.updatedAt,
        });
    });

    it('update respects empty values', async () => {
        // Arrange
        const model = await User.create({ name: faker.name.firstName(), birthDate: null });

        // Act
        await model.update({ name: faker.name.firstName() });

        // Assert
        expect(model.birthDate).toBeNull();
    });

    it('set attribute', async () => {
        // Arrange
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();
        const model = await User.create({ name: initialName, surname });
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        // Act
        await after({ ms: 100 });

        model.setAttribute('name', newName);

        await model.save();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.id).toBe(id);
        expect(model.name).toBe(newName);
        expect(model.surname).toBe(surname);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            name: newName,
            updatedAt: model.updatedAt,
        });
    });

    it('unset attribute', async () => {
        // Arrange
        const name = faker.name.firstName();
        const now = seconds();
        const model = await User.create({ name, surname: faker.name.lastName() });
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        // Act
        await after({ ms: 100 });

        model.unsetAttribute('surname');

        await model.save();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            updatedAt: model.updatedAt,
            surname: { $unset: true },
        });
    });

    it('delete', async () => {
        // Arrange
        const name = faker.name.firstName();
        const model = await User.create({ name });
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        // Act
        await model.delete();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.id).toBeUndefined();
        expect(model.name).toBe(name);
        expect(model.exists()).toBe(false);
        expect(model.wasRecentlyDeleted()).toBe(true);
        expect(model.getDeletedPrimaryKey()).toBe(id);
        expect(FakeEngine.delete).toHaveBeenCalledTimes(1);
        expect(FakeEngine.delete).toHaveBeenCalledWith(User.collection, id);
    });

    it('throw engine missing error', async () => {
        setEngine(null);

        const createModel = () => User.create({ name: faker.name.firstName() });
        await expect(createModel()).rejects.toThrow(SoukaiError);
        await expect(createModel()).rejects.toThrow('Engine must be initialized before performing any operations');
    });

});

describe('Model attributes', () => {

    beforeEach(() => {
        FakeEngine.reset();
        FakeEngine.use();

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

    it('attribute aliases work', () => {
        // Arrange
        const Schema = defineModelSchema({
            fields: {
                name: FieldType.String,
                surname: FieldType.String,
                lastName: {
                    type: FieldType.String,
                    alias: 'surname',
                },
            },
        });

        class StubModel extends Schema {}

        bootModels({ StubModel });

        // Act & Assert
        const instance = new StubModel({ name: 'John', surname: 'Doe' }, true);

        expect(instance.name).toEqual('John');
        expect(instance.surname).toEqual('Doe');
        expect(instance.lastName).toEqual('Doe');

        instance.surname = 'Snow';
        expect(instance.name).toEqual('John');
        expect(instance.surname).toEqual('Snow');
        expect(instance.lastName).toEqual('Snow');

        instance.lastName = '5';
        expect(instance.name).toEqual('John');
        expect(instance.surname).toEqual('5');
        expect(instance.lastName).toEqual('5');
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
        const instance = new StubModel(
            {
                date: new Date(),
                numbers: [],
            },
            true,
        );

        // Assert
        expect(instance.getAttribute('date')).toEqual('casted date');
        expect(instance.getOriginalAttribute('date')).toEqual('casted date');
        expect(instance.getAttribute('numbers')).toEqual('casted array');
        expect(instance.getOriginalAttribute('numbers')).toEqual('casted array');
    });

    it('updates schema definitions', async () => {
        // Arrange
        let listenerCalled = false;

        class StubUser extends UserSchema {}

        bootModels({ StubUser });

        expect(StubUser.primaryKey).toEqual('id');
        expect(StubUser.timestamps).toEqual([TimestampField.CreatedAt, TimestampField.UpdatedAt]);
        expect(StubUser.fields.name).toEqual({
            type: FieldType.String,
            required: true,
        });

        StubUser.on('schema-updated', (schema) => (listenerCalled = schema.primaryKey === 'uuid'));

        // Act
        await StubUser.updateSchema({
            primaryKey: 'uuid',
            timestamps: [TimestampField.CreatedAt],
            fields: {
                firstName: FieldType.String,
                lastName: FieldType.String,
                social: FieldType.Boolean,
            },
        });

        // Assert
        expect(listenerCalled).toBe(true);

        expect(StubUser.primaryKey).toEqual('uuid');
        expect(StubUser.timestamps).toEqual([TimestampField.CreatedAt]);
        expect(StubUser.fields).toEqual({
            uuid: {
                type: FieldType.Key,
                required: false,
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            firstName: {
                type: FieldType.String,
                required: false,
            },
            lastName: {
                type: FieldType.String,
                required: false,
            },
            social: {
                type: FieldType.Boolean,
                required: false,
            },
        });
    });

    it('updates schema definitions using classes', async () => {
        // Arrange
        let listenerCalled = false;

        class StubUser extends UserSchema {}

        bootModels({ StubUser });

        expect(StubUser.primaryKey).toEqual('id');
        expect(StubUser.timestamps).toEqual([TimestampField.CreatedAt, TimestampField.UpdatedAt]);
        expect(StubUser.fields.name).toEqual({
            type: FieldType.String,
            required: true,
        });

        StubUser.on('schema-updated', (schema) => (listenerCalled = schema.primaryKey === 'uuid'));

        // Act
        const schema = defineModelSchema({
            primaryKey: 'uuid',
            timestamps: [TimestampField.CreatedAt],
            fields: {
                firstName: FieldType.String,
                lastName: FieldType.String,
                social: FieldType.Boolean,
            },
        });

        await StubUser.updateSchema(schema);

        // Assert
        expect(listenerCalled).toBe(true);

        expect(StubUser.primaryKey).toEqual('uuid');
        expect(StubUser.timestamps).toEqual([TimestampField.CreatedAt]);
        expect(StubUser.fields).toEqual({
            uuid: {
                type: FieldType.Key,
                required: false,
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            firstName: {
                type: FieldType.String,
                required: false,
            },
            lastName: {
                type: FieldType.String,
                required: false,
            },
            social: {
                type: FieldType.Boolean,
                required: false,
            },
        });
    });

    it('fixes malformed attributes', async () => {
        // Arrange
        const id = uuid();

        FakeEngine.database[User.collection] = {
            [id]: {
                id,
                name: 'Alice',
                avatarUrl: 'https://example.org/avatar.png',
                externalUrls: [`https://a.example.org/users/${id}`, `https://b.example.org/users/${id}`],
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        };

        // Act
        const user = (await User.find(id)) as User;
        const malformedAttributes = user.getMalformedDocumentAttributes();

        user.fixMalformedAttributes();

        await user.withoutTimestamps(() => user.save());

        // Assert
        expect(Object.keys(malformedAttributes)).toHaveLength(1);

        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            avatarUrl: 'https://example.org/avatar.png',
        });
    });

    it('attribute setter', async () => {
        // Arrange
        const surname = faker.name.lastName();
        const initialName = faker.name.firstName();
        const newName = faker.name.firstName();
        const now = seconds();
        const model = await User.create({ name: initialName, surname });
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        // Act
        await after({ ms: 100 });

        model.name = newName;

        await model.save();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.id).toBe(id);
        expect(model.name).toBe(newName);
        expect(model.surname).toBe(surname);
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            name: newName,
            updatedAt: model.updatedAt,
        });
    });

    it('attribute deleter', async () => {
        // Arrange
        const name = faker.name.firstName();
        const now = seconds();
        const model = await User.create({ name, surname: faker.name.lastName() });
        const id = Object.keys(FakeEngine.database[User.collection])[0];

        // Act
        await after({ ms: 100 });

        delete model.surname;

        await model.save();

        // Assert
        expect(model).toBeInstanceOf(User);
        expect(model.id).toBe(id);
        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
        expect(model.getAttributes(true)).toHaveProperty('surname');
        expect(model.updatedAt).toBeInstanceOf(Date);
        expect(now - seconds(model.updatedAt)).toBeLessThan(1);
        expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime() + 10);
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, id, {
            updatedAt: model.updatedAt,
            surname: { $unset: true },
        });
    });

    it('undefined attributes', () => {
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

    it('smart dirty attributes on setter', () => {
        const model = new User(
            {
                name: faker.name.firstName(),
                surname: faker.name.lastName(),
                contact: { phone: faker.phone.number() },
            },
            true,
        );

        const originalSurname = model.surname;

        model.name = faker.name.firstName();
        model.surname = faker.name.lastName();
        model.surname = originalSurname;
        model.social = { mastodon: faker.internet.userName() };
        model.age = 42;
        delete model.age;
        delete model.contact;

        expect(model.isDirty('name')).toBe(true);
        expect(model.isDirty('surname')).toBe(false);
        expect(model.isDirty('social')).toBe(true);
        expect(model.isDirty('age')).toBe(false);
        expect(model.isDirty('contact')).toBe(true);
    });

    it('smart dirty attributes on update', async () => {
        // Arrange
        const model = new User(
            {
                id: uuid(),
                name: faker.name.firstName(),
                surname: faker.name.lastName(),
                contact: { phone: faker.phone.number() },
            },
            true,
        );

        FakeEngine.database[User.collection] = {
            [model.id]: model.getAttributes(),
        };

        // Act
        await model.update({
            name: faker.name.firstName(),
            surname: model.surname,
            social: { twitter: faker.internet.userName() },
            contact: undefined,
        });

        // Assert
        expect(FakeEngine.update).toHaveBeenCalledTimes(1);
        expect(FakeEngine.update).toHaveBeenCalledWith(User.collection, model.id, {
            name: model.name,
            social: model.social,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            contact: { $unset: true },
        });
    });

});

describe('Model types', () => {

    it(
        'infers magic attributes',
        tt<
            | Expect<Equals<User['name'], string>>
            | Expect<Equals<User['surname'], string | undefined>>
            | Expect<Equals<User['age'], number | undefined>>
            | Expect<Equals<User['birthDate'], Date | undefined>>
            | Expect<Extends<User['contact'], undefined>>
            | Expect<Equals<Assert<User['contact']>['email'], string | undefined>>
            | Expect<Extends<User['social'], undefined>>
            | Expect<Equals<Assert<User['social']>['website'], string | undefined>>
            | Expect<Equals<User['externalUrls'], string[]>>
            | Expect<Equals<User['createdAt'], Date>>
            | Expect<Equals<Post['title'], string>>
            | Expect<Equals<Pick<Post, 'title'>, { title: string }>>
            | Expect<Equals<City['name'], string>>
            | Expect<Equals<City['birthRecords'], Key[] | undefined>>
            | Expect<Equals<City['createdAt'], Date>>
            | Expect<Not<HasKey<City, 'updatedAt'>>>
            | Expect<Not<HasKey<User, 'undefinedProperty'>>>
            | true
        >(),
    );

});

import { beforeEach, describe, expect, it } from 'vitest';

import { faker } from '@noeldemartin/faker';
import { type Tuple, uuid } from '@noeldemartin/utils';

import BelongsToOneRelation from 'soukai/models/relations/BelongsToOneRelation';
import HasManyRelation from 'soukai/models/relations/HasManyRelation';
import HasOneRelation from 'soukai/models/relations/HasOneRelation';
import type { Relation } from 'soukai/models/relations/Relation';

import { FieldType } from 'soukai/models/fields';
import { Model, bootModels, defineModelSchema } from 'soukai/models';

import City from 'soukai/testing/stubs/City';
import Post from 'soukai/testing/stubs/Post';
import User from 'soukai/testing/stubs/User';
import FakeEngine from 'soukai/testing/fakes/FakeEngine';

describe('Model Relations', () => {

    beforeEach(() => {
        FakeEngine.reset();
        FakeEngine.use();

        bootModels({ User, Post, City });
    });

    it('loads hasOne relations', async () => {
        // Arrange
        const userId = uuid();
        const cityId = uuid();
        const name = faker.random.word();
        const user = new User({ id: userId });

        FakeEngine.database[City.collection] = { [cityId]: { name, birthRecords: [userId] } };

        // Act
        await user.loadRelation('birthPlace');

        // Assert
        expect(user.birthPlace).toBeInstanceOf(City);

        const birthPlace = user.birthPlace as City;
        expect(birthPlace.id).toBe(cityId);
        expect(birthPlace.name).toBe(name);

        expect(FakeEngine.readMany).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readMany).toHaveBeenCalledWith(City.collection, {
            birthRecords: {
                $or: [{ $eq: userId }, { $contains: userId }],
            },
        });
    });

    it('loads belongsToOne relations', async () => {
        // Arrange
        const id = uuid();
        const name = faker.random.word();
        const post = new Post({ authorId: id });

        FakeEngine.database[User.collection] = { [id]: { name } };

        // Act
        await post.loadRelation('author');

        // Assert
        expect(post.author).toBeInstanceOf(User);

        const author = post.author as User;
        expect(author.id).toBe(id);
        expect(author.name).toBe(name);

        expect(FakeEngine.readOne).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readOne).toHaveBeenCalledWith(User.collection, id);
    });

    it('loads hasMany relations', async () => {
        // Arrange
        const id = uuid();
        const firstPostId = uuid();
        const secondPostId = uuid();
        const firstPostTitle = faker.lorem.sentence();
        const secondPostTitle = faker.lorem.sentence();
        const firstPostBody = faker.lorem.paragraph();
        const secondPostBody = faker.lorem.paragraph();
        const user = new User({ id });

        FakeEngine.database[Post.collection] = {
            [firstPostId]: { title: firstPostTitle, body: firstPostBody, authorId: id },
            [secondPostId]: { title: secondPostTitle, body: secondPostBody, authorId: id },
            [uuid()]: { title: faker.lorem.sentence(), body: faker.lorem.paragraph(), authorId: uuid() },
        };

        // Act
        await user.loadRelation('posts');

        // Assert
        expect(user.posts).not.toBeNull();
        expect(user.posts).toHaveLength(2);

        const posts = user.posts as Tuple<Post, 2>;
        expect(posts[0]).toBeInstanceOf(Post);
        expect(posts[0].id).toBe(firstPostId);
        expect(posts[0].title).toBe(firstPostTitle);
        expect(posts[0].body).toBe(firstPostBody);
        expect(posts[1]).toBeInstanceOf(Post);
        expect(posts[1].id).toBe(secondPostId);
        expect(posts[1].title).toBe(secondPostTitle);
        expect(posts[1].body).toBe(secondPostBody);

        expect(FakeEngine.readMany).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readMany).toHaveBeenCalledWith(Post.collection, {
            authorId: {
                $or: [{ $eq: id }, { $contains: id }],
            },
        });
    });

    it('loads belongsToMany relations', async () => {
        // Arrange
        const id = uuid();
        const name = faker.random.word();
        const city = new City({ birthRecords: [id] });

        FakeEngine.database[User.collection] = { [id]: { name } };

        // Act
        await city.loadRelation('natives');

        // Assert
        expect(city.natives).not.toBeNull();
        expect(city.natives).toHaveLength(1);

        const natives = city.natives as Tuple<User, 1>;
        expect(natives[0]).toBeInstanceOf(User);
        expect(natives[0].id).toBe(id);
        expect(natives[0].name).toBe(name);

        expect(FakeEngine.readMany).toHaveBeenCalledTimes(1);
        expect(FakeEngine.readMany).toHaveBeenCalledWith(User.collection, {
            $in: [id],
        });
    });

    it('loads relations using setter', () => {
        // Arrange
        const id = uuid();
        const name = faker.random.word();
        const post = new Post({ authorId: id });

        // Act
        post.author = new User({ id, name });

        // Assert
        expect(post.author).toBeInstanceOf(User);
        expect(post.author.id).toBe(id);
        expect(post.author.name).toBe(name);
    });

    it('loads empty relations for new models', async () => {
        // Arrange & Act
        const post = await Post.create({ title: faker.lorem.sentence() });
        const city = await City.create({ name: faker.random.word() });

        // Assert
        expect(post.isRelationLoaded('author')).toBe(true);
        expect(city.isRelationLoaded('natives')).toBe(true);

        expect(post.author).toBeNull();
        expect(city.natives).toHaveLength(0);
    });

    it('unloads relations using deletes', () => {
        // Arrange
        const id = uuid();
        const name = faker.random.word();
        const post = new Post({ authorId: id });

        post.author = new User({ id, name });

        // Act
        delete (post as { author?: unknown }).author;

        // Assert
        expect(post.author).toBeUndefined();
    });

    it('has unloaded relations', () => {
        expect(Post.relations).toContain('author');
        expect(User.relations).toContain('posts');
    });

    it('keeps relations in local class', () => {
        // Arrange
        class Parent extends Model {

            public fooRelationship(): Relation {
                return this.belongsToOne(Model, 'id');
            }
        
        }

        class Child extends Parent {

            public barRelationship(): Relation {
                return this.belongsToOne(Model, 'id');
            }
        
        }

        // Act
        bootModels({ Parent, Child });

        // Assert
        expect(Parent.relations).toHaveLength(1);
        expect(Parent.relations).toContain('foo');

        expect(Child.relations).toHaveLength(2);
        expect(Child.relations).toContain('foo');
        expect(Child.relations).toContain('bar');
    });

    it('exposes relation instances', () => {
        // Arrange
        const postId = uuid();
        const userId = uuid();
        const postTitle = faker.random.word();
        const userName = faker.random.word();
        const post = new Post({ id: postId, authorId: userId, title: postTitle });
        const user = new User({ id: userId, name: userName });

        // Assert
        expect(post.relatedAuthor).toBeInstanceOf(BelongsToOneRelation);
        expect(post.relatedAuthor.parent).toBe(post);

        expect(user.relatedPosts).toBeInstanceOf(HasManyRelation);
        expect(user.relatedPosts.parent).toBe(user);
        expect(user.relatedBirthPlace).toBeInstanceOf(HasOneRelation);
        expect(user.relatedBirthPlace.parent).toBe(user);
    });

    it('resolves circular relationships in clones', () => {
        // Arrange.
        const ParentSchema = defineModelSchema({});

        class Parent extends ParentSchema {

            declare public children?: Child[];
            declare public relatedChildren: HasManyRelation<this, Child, typeof Child>;

            public childrenRelationship(): Relation {
                return this.hasMany(Child, 'parentId');
            }
        
        }

        const ChildSchema = defineModelSchema({ fields: { parentId: FieldType.Key } });

        class Child extends ChildSchema {

            declare public parent?: Parent;
            declare public relatedParent: HasOneRelation<this, Parent, typeof Parent>;

            public parentRelationship(): Relation {
                return this.belongsToOne(Parent, 'parentId');
            }
        
        }

        const parent = new Parent({ id: 'parent' });

        parent.relatedChildren.attach({ id: 'child-1', parentId: 'parent' });
        parent.relatedChildren.attach({ id: 'child-2', parentId: 'parent' });
        parent.relatedChildren.attach({ id: 'child-3', parentId: 'parent' });

        bootModels({ Parent, Child });

        // Act.
        const clone = parent.clone();

        // Assert.
        expect(clone.id).toEqual('parent');

        const children = clone.children as Tuple<Child, 3>;
        expect(children).toHaveLength(3);
        expect(children[0].id).toEqual('child-1');
        expect(children[1].id).toEqual('child-2');
        expect(children[2].id).toEqual('child-3');

        expect(clone.relatedChildren.parent).toBe(clone);

        children.forEach((child) => {
            expect(child.parentId).toEqual('parent');
            expect(child.parent).toBe(clone);
        });
    });

});

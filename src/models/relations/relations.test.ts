import Faker from 'faker';

import Soukai from '@/Soukai';

import type { Engine } from '@/engines/Engine';

import BelongsToOneRelation from '@/models/relations/BelongsToOneRelation';
import HasManyRelation from '@/models/relations/HasManyRelation';
import HasOneRelation from '@/models/relations/HasOneRelation';
import type Relation from '@/models/relations/Relation';

import { Model } from '@/models/Model';

import MockEngine from '@/testing/mocks/MockEngine';

import City from '@/testing/stubs/City';
import Post from '@/testing/stubs/Post';
import User from '@/testing/stubs/User';

describe('Model Relations', () => {

    let mockEngine: jest.Mocked<Engine>;

    beforeEach(() => {
        MockEngine.mockClear();
        Soukai.useEngine(mockEngine = new MockEngine());
        Soukai.loadModels({ User, Post, City });
    });

    it('loads hasOne relations', async () => {
        // Arrange
        const userId = Faker.random.uuid();
        const cityId = Faker.random.uuid();
        const name = Faker.random.word();
        const user = new User({ id: userId });

        mockEngine.readMany.mockReturnValue(Promise.resolve({
            [cityId]: { name },
        }));

        // Act
        await user.loadRelation('birthPlace');

        // Assert
        expect(user.birthPlace).toBeInstanceOf(City);

        const birthPlace = user.birthPlace as City;
        expect(birthPlace.id).toBe(cityId);
        expect(birthPlace.name).toBe(name);

        expect(mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(mockEngine.readMany).toHaveBeenCalledWith(City.collection, {
            birthRecords: {
                $or: [
                    { $eq: userId },
                    { $contains: userId },
                ],
            },
        });
    });

    it('loads belongsToOne relations', async () => {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.random.word();
        const post = new Post({ authorId: id });

        mockEngine.readOne.mockReturnValue(Promise.resolve({ name }));

        // Act
        await post.loadRelation('author');

        // Assert
        expect(post.author).toBeInstanceOf(User);

        const author = post.author as User;
        expect(author.id).toBe(id);
        expect(author.name).toBe(name);

        expect(mockEngine.readOne).toHaveBeenCalledTimes(1);
        expect(mockEngine.readOne).toHaveBeenCalledWith(User.collection, id);
    });

    it('loads hasMany relations', async () => {
        // Arrange
        const id = Faker.random.uuid();
        const firstPostId = Faker.random.uuid();
        const secondPostId = Faker.random.uuid();
        const firstPostTitle = Faker.lorem.sentence();
        const secondPostTitle = Faker.lorem.sentence();
        const firstPostBody = Faker.lorem.paragraph();
        const secondPostBody = Faker.lorem.paragraph();
        const user = new User({ id });

        mockEngine.readMany.mockReturnValue(Promise.resolve({
            [firstPostId]: { title: firstPostTitle, body: firstPostBody },
            [secondPostId]: { title: secondPostTitle, body: secondPostBody },
        }));

        // Act
        await user.loadRelation('posts');

        // Assert
        expect(user.posts).not.toBeNull();
        expect(user.posts).toHaveLength(2);

        const posts = user.posts as Post[];
        expect(posts[0]).toBeInstanceOf(Post);
        expect(posts[0].id).toBe(firstPostId);
        expect(posts[0].title).toBe(firstPostTitle);
        expect(posts[0].body).toBe(firstPostBody);
        expect(posts[1]).toBeInstanceOf(Post);
        expect(posts[1].id).toBe(secondPostId);
        expect(posts[1].title).toBe(secondPostTitle);
        expect(posts[1].body).toBe(secondPostBody);

        expect(mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(mockEngine.readMany).toHaveBeenCalledWith(
            Post.collection,
            {
                authorId: {
                    $or: [
                        { $eq: id },
                        { $contains: id },
                    ],
                },
            },
        );
    });

    it('loads belongsToMany relations', async () => {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.random.word();
        const city = new City({ birthRecords: [id] });

        mockEngine.readMany.mockReturnValue(Promise.resolve({
            [id]: { name },
        }));

        // Act
        await city.loadRelation('natives');

        // Assert
        expect(city.natives).not.toBeNull();
        expect(city.natives).toHaveLength(1);

        const natives = city.natives as User[];
        expect(natives[0]).toBeInstanceOf(User);
        expect(natives[0].id).toBe(id);
        expect(natives[0].name).toBe(name);

        expect(mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(mockEngine.readMany).toHaveBeenCalledWith(User.collection, {
            $in: [id],
        });
    });

    it('loads relations using setter', () => {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.random.word();
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
        const post = await Post.create({ title: Faker.lorem.sentence() });
        const city = await City.create({ name: Faker.random.word() });

        // Assert
        expect(post.isRelationLoaded('author')).toBe(true);
        expect(city.isRelationLoaded('natives')).toBe(true);

        expect(post.author).toBeNull();
        expect(city.natives).toHaveLength(0);
    });

    it('unloads relations using deletes', () => {
        // Arrange
        const id = Faker.random.uuid();
        const name = Faker.random.word();
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
        Soukai.loadModels({ Parent, Child });

        // Assert
        expect(Parent.relations).toHaveLength(1);
        expect(Parent.relations).toContain('foo');

        expect(Child.relations).toHaveLength(2);
        expect(Child.relations).toContain('foo');
        expect(Child.relations).toContain('bar');
    });

    it('exposes relation instances', () => {
        // Arrange
        const postId = Faker.random.uuid();
        const userId = Faker.random.uuid();
        const postTitle = Faker.random.word();
        const userName = Faker.random.word();
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

});

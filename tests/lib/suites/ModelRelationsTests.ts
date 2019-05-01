import Faker from 'faker';

import Soukai from '@/Soukai';

import Engine from '@/engines/Engine';

import MockEngine from '../mocks/MockEngine';

import Post from '../stubs/Post';
import User from '../stubs/User';

import TestSuite from '../TestSuite';

export default class extends TestSuite {

    public static title: string = 'Relations';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        User.load();
        Post.load();
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
    }

    public async testHasMany(): Promise<void> {
        const id = Faker.random.uuid();
        const firstPostId = Faker.random.uuid();
        const secondPostId = Faker.random.uuid();
        const firstPostTitle = Faker.lorem.sentence();
        const secondPostTitle = Faker.lorem.sentence();
        const firstPostBody = Faker.lorem.paragraph();
        const secondPostBody = Faker.lorem.paragraph();

        this.mockEngine.readMany.mockReturnValue(Promise.resolve([
            { id: firstPostId, title: firstPostTitle, body: firstPostBody },
            { id: secondPostId, title: secondPostTitle, body: secondPostBody },
        ]));

        const user = new User({ id });

        expect(user.posts).toBeUndefined();

        await user.loadRelation('posts');

        expect(user.posts).toHaveLength(2);
        expect(user.posts[0]).toBeInstanceOf(Post);
        expect(user.posts[0].id).toBe(firstPostId);
        expect(user.posts[0].title).toBe(firstPostTitle);
        expect(user.posts[0].body).toBe(firstPostBody);
        expect(user.posts[1]).toBeInstanceOf(Post);
        expect(user.posts[1].id).toBe(secondPostId);
        expect(user.posts[1].title).toBe(secondPostTitle);
        expect(user.posts[1].body).toBe(secondPostBody);

        expect(this.mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(this.mockEngine.readMany).toHaveBeenCalledWith(Post.collection, { authorId: id });
    }

    public async testBelongsToOne(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.random.word();

        this.mockEngine.readMany.mockReturnValue(Promise.resolve([
            { id, name },
        ]));

        const post = new Post({ authorId: id });

        expect(post.author).toBeUndefined();

        await post.loadRelation('author');

        expect(post.author).toBeInstanceOf(User);
        expect(post.author.id).toBe(id);
        expect(post.author.name).toBe(name);

        expect(this.mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(this.mockEngine.readMany).toHaveBeenCalledWith(User.collection, { id });
    }

    public async testSettingRelations(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.random.word();

        const post = new Post({ authorId: id });

        expect(post.author).toBeUndefined();

        post.author = new User({ id, name });

        expect(post.author).toBeInstanceOf(User);
        expect(post.author.id).toBe(id);
        expect(post.author.name).toBe(name);
    }

    public async testDeletingRelations(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.random.word();

        const post = new Post({ authorId: id });

        expect(post.author).toBeUndefined();

        post.author = new User({ id, name });

        expect(post.author).toBeInstanceOf(User);

        delete post.author;

        expect(post.author).toBeUndefined();
    }

    public async testRelationsExistUnloaded(): Promise<void> {
        expect(Post.relations).toContain('author');
        expect(User.relations).toContain('posts');
    }

}

import Faker from 'faker';

import Soukai from '@/Soukai';

import Engine from '@/engines/Engine';

import MockEngine from '../mocks/MockEngine';
import User from '../stubs/User';
import Post from '../stubs/Post';

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

        this.mockEngine.readOne.mockReturnValue(Promise.resolve({
            id,
            name: Faker.random.word(),
            birthDate: new Date(),
        }));

        this.mockEngine.readMany.mockReturnValue(Promise.resolve([
            { id: firstPostId, title: firstPostTitle, body: firstPostBody },
            { id: secondPostId, title: secondPostTitle, body: secondPostBody },
        ]));

        const user = new User({ id });

        expect(user.posts).toBeUndefined();

        await user.loadRelation('posts');

        expect(user.posts).toHaveLength(2);

        expect(this.mockEngine.readMany).toHaveBeenCalledTimes(1);
        expect(this.mockEngine.readMany).toHaveBeenCalledWith(Post, { authorId: id });
    }

}

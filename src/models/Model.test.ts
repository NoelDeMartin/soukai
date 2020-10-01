import Faker from 'faker';

import Soukai from '@/Soukai';

import Engine from '@/engines/Engine';

import MockEngine from '@testing/mocks/MockEngine';
import Post from '@testing/stubs/Post';
import User from '@testing/stubs/User';

describe('Model', () => {

    let mockEngine: jest.Mocked<Engine>;

    beforeEach(() => {
        MockEngine.mockClear();
        Soukai.useEngine(mockEngine = new MockEngine());
        Soukai.loadModels({ User, Post });
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

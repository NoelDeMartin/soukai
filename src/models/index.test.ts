import { tt } from '@noeldemartin/utils';
import type { Equals, Expect } from '@noeldemartin/utils';

import User from '@/testing/stubs/User';
import Post from '@/testing/stubs/Post';
import City from '@/testing/stubs/City';
import type { ModelConstructor } from '@/models/inference';

import { bootModels, requireBootedModel } from './index';

declare module './index' {
    interface ModelsRegistry {
        User: typeof User;
    }
}

describe('Models helpers', () => {

    it('registers booted models', () => {
        bootModels({ User, Post, City });

        const user = requireBootedModel('User');
        const post = requireBootedModel('Post');
        const city = requireBootedModel<typeof City>('City');

        expect(user).toBe(User);
        expect(post).toBe(Post);
        expect(city).toBe(City);

        tt<
            Expect<Equals<typeof user, typeof User>> |
            Expect<Equals<typeof post, ModelConstructor>> |
            Expect<Equals<typeof city, typeof City>> |
            true
        >();
    });

});

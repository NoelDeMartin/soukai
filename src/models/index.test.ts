import { describe, expect, it } from 'vitest';

import { tt } from '@noeldemartin/testing';
import type { Equals } from '@noeldemartin/utils';
import type { Expect } from '@noeldemartin/testing';

import User from 'soukai/testing/stubs/User';
import Post from 'soukai/testing/stubs/Post';
import City from 'soukai/testing/stubs/City';
import type { ModelConstructor } from 'soukai/models/inference';

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
            | Expect<Equals<typeof user, typeof User>>
            | Expect<Equals<typeof post, ModelConstructor>>
            | Expect<Equals<typeof city, typeof City>>
        >();
    });

});

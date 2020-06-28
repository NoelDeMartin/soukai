import City from '@testing/stubs/City';
import Post from '@testing/stubs/Post';
import User from '@testing/stubs/User';

import Soukai from './Soukai';

describe('Soukai', () => {

    it('retrieves booted models by name', () => {
        Soukai.loadModels({ City, Post, User });

        expect(Soukai.model(City.modelName)).toEqual(City);
        expect(Soukai.model(Post.modelName)).toEqual(Post);
        expect(Soukai.model(User.modelName)).toEqual(User);
    });

});

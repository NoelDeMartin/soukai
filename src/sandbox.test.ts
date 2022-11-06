import User from '@/testing/stubs/User';
import { bootModels } from '@/models';

describe('Sandbox', () => {

    beforeEach(() => bootModels({ User }));

    it('works', () => {
        const user = new User({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expect(user.externalDomains).toEqual([]);
    });

});

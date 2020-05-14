import { camelCase } from './Str';

describe('String helpers', () => {

    it('converts strings to camelCase', () => {
        expect(camelCase('foo_bar')).toEqual('fooBar');
        expect(camelCase('Foo Bar')).toEqual('fooBar');
        expect(camelCase('fooBar')).toEqual('fooBar');
    });

});

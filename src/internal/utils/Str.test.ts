import { camelCase, studlyCase } from './Str';

describe('String helpers', () => {

    it('converts strings to StudlyCase', () => {
        expect(studlyCase('foo_bar')).toEqual('FooBar');
        expect(studlyCase('Foo Bar')).toEqual('FooBar');
        expect(studlyCase('fooBar')).toEqual('FooBar');
    });

    it('converts strings to camelCase', () => {
        expect(camelCase('foo_bar')).toEqual('fooBar');
        expect(camelCase('Foo Bar')).toEqual('fooBar');
        expect(camelCase('fooBar')).toEqual('fooBar');
    });

});

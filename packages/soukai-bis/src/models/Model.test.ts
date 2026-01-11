import { describe, expect, expectTypeOf, it } from 'vitest';
import { ZodError } from 'zod';

import User from 'soukai-bis/testing/stubs/User';

describe('Model', () => {

    it('creates instances', () => {
        const user = new User({ name: 'John Doe' });

        expect(user.name).toEqual('John Doe');
        expectTypeOf(user).toExtend<{ name: string; email?: string; age?: number; friendUrls: string[] }>();
    });

    it('validates attributes in constructor', () => {
        expect(() => new User({ name: 'John Doe', email: 'invalid-email' })).toThrow(ZodError);
    });

    it('serializes to JsonLD', async () => {
        const user = new User({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

        expect(await user.toJsonLD()).toEqualJsonLD({
            '@context': 'http://xmlns.com/foaf/0.1/',
            '@id': '#it',
            '@type': 'Person',
            'name': 'John Doe',
            'knows': [{ '@id': 'https://example.pod/alice#me' }],
        });
    });

    it('serializes to Turtle', async () => {
        const user = new User({ name: 'John Doe', friendUrls: ['https://example.pod/alice#me'] });

        expect(await user.toTurtle()).toEqualTurtle(`
            @prefix foaf: <http://xmlns.com/foaf/0.1/> .

            <#it>
                a foaf:Person ;
                foaf:name "John Doe" ;
                foaf:knows <https://example.pod/alice#me> .
        `);
    });

    it('has typed constructors', () => {
        expectTypeOf(User).toBeConstructibleWith({ name: 'John' });
        expectTypeOf(User).toBeConstructibleWith({ name: 'John', age: 30 });
        expectTypeOf({ name: 123 }).not.toExtend<ConstructorParameters<typeof User>[0]>();
        expectTypeOf({ undefinedField: true }).not.toExtend<ConstructorParameters<typeof User>[0]>();
    });

});

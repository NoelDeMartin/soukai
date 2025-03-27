import { beforeAll, describe, expect, it } from 'vitest';
import { bootModels } from 'soukai';

import Person from 'soukai-solid/testing/lib/stubs/Person';

describe('SolidACLAuthorizationsRelation', () => {

    beforeAll(() => bootModels({ Person }));

    it('is ignored for serialization', async () => {
        // Arrange
        const person = new Person({ name: 'John Doe' });

        person.relatedAuthorizations.attach();
        person.relatedAuthorizations.enable();

        // Act
        const jsonld = person.toJsonLD();

        // Assert
        expect(jsonld).toEqual({
            '@context': {
                '@vocab': 'http://xmlns.com/foaf/0.1/',
                'crdt': 'https://vocab.noeldemartin.com/crdt/',
                'metadata': { '@reverse': 'crdt:resource' },
                'vcard': 'http://www.w3.org/2006/vcard/ns#',
            },
            '@type': 'Person',
            'name': 'John Doe',
            'metadata': { '@type': 'crdt:Metadata' },
        });
    });

});

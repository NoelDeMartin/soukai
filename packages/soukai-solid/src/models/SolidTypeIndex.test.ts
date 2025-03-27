import { beforeEach, describe, expect, it } from 'vitest';
import { FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai';

import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

import SolidTypeIndex from './SolidTypeIndex';

describe('SolidTypeIndex', () => {

    beforeEach(() => setEngine(new SolidEngine(FakeServer.fetch)));

    it('reads type registrations', async () => {
        // Arrange
        const typeIndexUrl = fakeDocumentUrl();

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <>
                    a solid:TypeIndex ;
                    a solid:ListedDocument.

                <#movies> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instanceContainer </movies>.

                <#recipes> a solid:TypeRegistration;
                    solid:forClass schema:Recipe;
                    solid:instanceContainer </recipes>.

                <#spirited-away> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instance </movies/spirited-away>.

                <#ramen> a solid:TypeRegistration;
                    solid:forClass schema:Recipe;
                    solid:instance </recipes/ramen>.
            `,
        );

        // Act
        const typeIndex = await SolidTypeIndex.find(typeIndexUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);

        expect(typeIndex).not.toBeNull();
        expect(typeIndex?.registrations).toHaveLength(4);
    });

});

import { faker } from '@noeldemartin/faker';
import { FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai';
import { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import SolidTypeIndex from 'soukai-solid/models/SolidTypeIndex';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('DocumentContainsManyRelation', () => {
    beforeEach(() => setEngine(new SolidEngine(FakeServer.fetch)));

    it('loads related documents', async () => {
        // Arrange
        const podUrl = faker.internet.url();
        const typeIndexUrl = fakeDocumentUrl({ containerUrl: podUrl + '/' });

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .
                @prefix foaf: <http://xmlns.com/foaf/0.1/> .

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

                <#something-else>
                    a foaf:Person ;
                    foaf:name "Alice" .
            `,
        );

        // Act
        const typeIndex = await SolidTypeIndex.find(typeIndexUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);

        const registration = (idSuffix: string) => {
            return typeIndex?.registrations.find((_registration) => _registration.url.endsWith(idSuffix));
        };

        expect(typeIndex).not.toBeNull();
        expect(typeIndex?.registrations).toHaveLength(4);

        expect(registration('movies')?.forClass).toEqual(['https://schema.org/Movie']);
        expect(registration('movies')?.instanceContainer).toEqual(`${podUrl}/movies`);
        expect(registration('movies')?.instance).toBeUndefined();

        expect(registration('recipes')?.forClass).toEqual(['https://schema.org/Recipe']);
        expect(registration('recipes')?.instanceContainer).toEqual(`${podUrl}/recipes`);
        expect(registration('recipes')?.instance).toBeUndefined();

        expect(registration('spirited-away')?.forClass).toEqual(['https://schema.org/Movie']);
        expect(registration('spirited-away')?.instance).toEqual(`${podUrl}/movies/spirited-away`);
        expect(registration('spirited-away')?.instanceContainer).toBeUndefined();

        expect(registration('ramen')?.forClass).toEqual(['https://schema.org/Recipe']);
        expect(registration('ramen')?.instance).toEqual(`${podUrl}/recipes/ramen`);
        expect(registration('ramen')?.instanceContainer).toBeUndefined();
    });

    it.todo('creates new documents with related documents');
    it.todo('adds models in existing documents');
    it.todo('updates models in existing documents');
    it.todo('removes models in existing documents');
});

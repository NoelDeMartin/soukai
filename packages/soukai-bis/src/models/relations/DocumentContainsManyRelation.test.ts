import { FakeServer, fakeDocumentUrl } from '@noeldemartin/testing';
import TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it } from 'vite-plus/test';

describe('DocumentContainsManyRelation', () => {
    useSolidEngine();

    it('loads documents models', async () => {
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
            `,
        );

        // Act
        const typeIndex = await TypeIndex.find(typeIndexUrl);

        // Assert
        expect(FakeServer.fetch).toHaveBeenCalledTimes(1);

        expect(typeIndex).not.toBeNull();
        expect(typeIndex?.registrations).toHaveLength(2);
    });
});

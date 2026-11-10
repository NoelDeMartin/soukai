import { FakeServer, fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { setEngine } from 'soukai-bis/engines';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import Container from 'soukai-bis/models/ldp/Container';
import { bootModels } from 'soukai-bis/models/registry';
import Post from 'soukai-bis/testing/stubs/Post';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import Person from './Person';

describe('Person', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('finds registered containers in all type indexes', async () => {
        // Arrange
        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const containerUrl = fakeContainerUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        FakeServer.respondOnce(
            publicTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .
            `,
        );
        FakeServer.respondOnce(
            privateTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instanceContainer <${containerUrl}> .
            `,
        );
        FakeServer.respondOnce(
            containerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .

                <> a ldp:Container .
            `,
        );

        // Act
        const containers = await person.findRegisteredContainers(Post);

        // Assert
        expect(containers.map((container) => container.url)).toEqual([containerUrl]);
    });

    it('creates instances from profiles', () => {
        // Arrange
        class User extends Person {}

        // Act
        const user = User.createFromProfile({
            webId: 'https://alice.example/profile/card#me',
            shallow: false,
            cloakedDocumentUrls: [],
            storageUrls: ['https://alice.example/'],
            publicTypeIndexUrls: ['https://alice.example/settings/publicTypeIndex'],
            privateTypeIndexUrls: [],
            writableProfileUrl: 'https://alice.example/profile/card',
        });

        // Assert
        expect(user).toBeInstanceOf(User);
        expect(user.url).toEqual('https://alice.example/profile/card#me');
        expect(user.publicTypeIndexUrls).toEqual(['https://alice.example/settings/publicTypeIndex']);
    });

    it('finds type indexes with their registration', async () => {
        // Arrange
        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        FakeServer.respondOnce(publicTypeIndexUrl, '<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');
        FakeServer.respondOnce(privateTypeIndexUrl, '<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');

        // Act
        const typeIndexes = await person.findTypeIndexes();

        // Assert
        expect(typeIndexes).toHaveLength(2);
        expect(typeIndexes[0]?.url).toEqual(publicTypeIndexUrl);
        expect(typeIndexes[0]?.isPublicRegistration()).toBe(true);
        expect(typeIndexes[0]?.isPrivateRegistration()).toBe(false);
        expect(typeIndexes[1]?.url).toEqual(privateTypeIndexUrl);
        expect(typeIndexes[1]?.isPublicRegistration()).toBe(false);
        expect(typeIndexes[1]?.isPrivateRegistration()).toBe(true);
    });

    it('finds public and private type indexes', async () => {
        // Arrange
        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        FakeServer.respondOnce(publicTypeIndexUrl, '<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');
        FakeServer.respondOnce(privateTypeIndexUrl, '<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .');

        // Act
        const publicTypeIndexes = await person.findPublicTypeIndexes();
        const privateTypeIndexes = await person.findPrivateTypeIndexes();

        // Assert
        expect(publicTypeIndexes.map((typeIndex) => typeIndex.url)).toEqual([publicTypeIndexUrl]);
        expect(publicTypeIndexes[0]?.isPublicRegistration()).toBe(true);
        expect(privateTypeIndexes.map((typeIndex) => typeIndex.url)).toEqual([privateTypeIndexUrl]);
        expect(privateTypeIndexes[0]?.isPrivateRegistration()).toBe(true);
    });

    it('finds registered containers in public or private type indexes', async () => {
        // Arrange
        class PostsContainer extends Container {}

        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const publicContainerUrl = fakeContainerUrl();
        const privateContainerUrl = fakeContainerUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        bootModels({ PostsContainer });

        FakeServer.respondOnce(
            publicTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instanceContainer <${publicContainerUrl}> .
            `,
        );
        FakeServer.respondOnce(
            privateTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instanceContainer <${privateContainerUrl}> .
            `,
        );
        FakeServer.respondOnce(privateContainerUrl, '<> a <http://www.w3.org/ns/ldp#Container> .');

        // Act
        const containers = await person.findRegisteredContainers(Post, {
            registration: 'private',
            containerModelClass: PostsContainer,
        });

        // Assert
        expect(containers).toHaveLength(1);
        expect(containers[0]).toBeInstanceOf(PostsContainer);
        expect(containers[0]?.url).toEqual(privateContainerUrl);
        expect(FakeServer.getRequests('GET', publicTypeIndexUrl)).toHaveLength(0);
    });

    it('finds registered instances in all type indexes', async () => {
        // Arrange
        const publicTypeIndexUrl = fakeDocumentUrl();
        const privateTypeIndexUrl = fakeDocumentUrl();
        const publicDocumentUrl = fakeDocumentUrl();
        const privateDocumentUrl = fakeDocumentUrl();
        const person = new Person(
            {
                url: `${fakeDocumentUrl()}#me`,
                publicTypeIndexUrls: [publicTypeIndexUrl],
                privateTypeIndexUrls: [privateTypeIndexUrl],
            },
            { exists: true },
        );

        FakeServer.respondOnce(
            publicTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#post>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instance <${publicDocumentUrl}#it> .
            `,
        );
        FakeServer.respondOnce(
            privateTypeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .

                <> a solid:TypeIndex .

                <#post>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instance <${privateDocumentUrl}#it> .

                <#public-post>
                    a solid:TypeRegistration ;
                    solid:forClass <https://schema.org/Article> ;
                    solid:instance <${publicDocumentUrl}#it> .
            `,
        );
        FakeServer.respond(
            publicDocumentUrl,
            `
                <#it> a <https://schema.org/Article> ; <https://schema.org/name> "Public post" .
                <#other> a <https://schema.org/Article> ; <https://schema.org/name> "Unregistered post" .
            `,
        );
        FakeServer.respondOnce(
            privateDocumentUrl,
            '<#it> a <https://schema.org/Article> ; <https://schema.org/name> "Private post" .',
        );

        // Act
        const posts = await person.findRegisteredInstances(Post);

        // Assert
        expect(posts.map((post) => post.title)).toEqual(['Public post', 'Private post']);
        expect(posts.every((post) => post instanceof Post)).toBe(true);
    });
});

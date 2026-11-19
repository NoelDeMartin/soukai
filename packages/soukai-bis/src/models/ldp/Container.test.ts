import { FakeResponse, FakeServer } from '@noeldemartin/testing';
import { arraySorted } from '@noeldemartin/utils';
import { setEngine } from 'soukai-bis/engines';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import ComputedAttribute, { InvalidationStrategies } from 'soukai-bis/models/computed-attributes/ComputedAttribute';
import { loaded } from 'soukai-bis/models/computed-attributes/helpers';
import { bootModels } from 'soukai-bis/models/registry';
import { isContainedBy } from 'soukai-bis/models/relations/fluent';
import { defineSchema } from 'soukai-bis/models/schema';
import Movie from 'soukai-bis/testing/stubs/Movie';
import PostsCollection from 'soukai-bis/testing/stubs/PostsCollection';
import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { string } from 'zod';

import Container from './Container';

describe('Container', () => {
    beforeEach(() => setEngine(new SolidEngine({ fetch: FakeServer.fetch })));

    it('creates containers from type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <> a solid:TypeIndex .

                <#movies>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .

                <#watched>
                    a solid:TypeRegistration ;
                    solid:forClass schema:WatchAction, schema:Movie ;
                    solid:instanceContainer <https://alice.example/watched/> .

                <#movies-again>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .

                <#posts>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Article ;
                    solid:instanceContainer <https://alice.example/posts/> .

                <#movie>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instance <https://alice.example/movies/spirited-away> .
            `,
        );

        // Act
        const containers = await Container.createFromTypeIndex(typeIndexUrl, Movie);

        // Assert
        expect(containers.map((container) => container.url)).toEqual([
            'https://alice.example/movies/',
            'https://alice.example/watched/',
        ]);
        expect(containers.every((container) => container.exists())).toBe(true);
    });

    it('creates containers registered for all the classes of a model', async () => {
        // Arrange
        class Todo extends defineSchema({
            rdfContexts: { schema: 'https://schema.org/', ical: 'http://www.w3.org/2002/12/cal/ical#' },
            rdfClasses: ['schema:Action', 'ical:Vtodo'],
        }) {}

        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';

        bootModels({ Todo });

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .
                @prefix ical: <http://www.w3.org/2002/12/cal/ical#> .

                <> a solid:TypeIndex .

                <#actions>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Action ;
                    solid:instanceContainer <https://alice.example/actions/> .

                <#todos>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Action, ical:Vtodo ;
                    solid:instanceContainer <https://alice.example/todos/> .
            `,
        );

        // Act
        const containers = await Container.createFromTypeIndex(typeIndexUrl, Todo);

        // Assert
        expect(containers.map((container) => container.url)).toEqual(['https://alice.example/todos/']);
    });

    it('registers containers in type indexes', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const container = new Container({ url: 'https://alice.example/movies/' }, { exists: true });

        FakeServer.respondWith(typeIndexUrl, (request) =>
            request.method === 'GET'
                ? FakeResponse.success('<> a <http://www.w3.org/ns/solid/terms#TypeIndex> .')
                : FakeResponse.success(),
        );

        // Act
        await container.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.getRequest('PATCH', typeIndexUrl)?.body).toEqualSparql(`
            INSERT DATA {
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <#[[.*]]> a solid:TypeRegistration;
                    solid:forClass schema:Movie;
                    solid:instanceContainer <https://alice.example/movies/> .
            }
        `);
    });

    it('does not register containers twice using type index urls', async () => {
        // Arrange
        const typeIndexUrl = 'https://alice.example/settings/privateTypeIndex';
        const container = new Container({ url: 'https://alice.example/movies/' }, { exists: true });

        FakeServer.respondOnce(
            typeIndexUrl,
            `
                @prefix solid: <http://www.w3.org/ns/solid/terms#> .
                @prefix schema: <https://schema.org/> .

                <> a solid:TypeIndex .

                <#movies>
                    a solid:TypeRegistration ;
                    solid:forClass schema:Movie ;
                    solid:instanceContainer <https://alice.example/movies/> .
            `,
        );

        // Act
        await container.register(typeIndexUrl, Movie);

        // Assert
        expect(FakeServer.getRequests('PATCH', typeIndexUrl)).toHaveLength(0);
    });

    it('deletes empty containers', async () => {
        // Arrange
        const engine = new InMemoryEngine();

        setEngine(engine);

        const collection = await PostsCollection.create({ url: 'local://posts/' });

        // Act
        await collection.delete();

        // Assert
        expect(collection.exists()).toBe(false);
        expect(Object.keys(engine.documents)).not.toContain(collection.url);
    });

    it('fails deleting containers with documents', async () => {
        // Arrange
        const engine = new InMemoryEngine();

        setEngine(engine);

        const collection = await PostsCollection.create({ url: 'local://posts/' });
        const post = await collection.relatedPosts.create({ title: 'Hello World' });
        const freshCollection = await PostsCollection.findOrFail(collection.url);

        // Act & Assert
        await expect(freshCollection.delete()).rejects.toThrow(SoukaiError);

        expect(freshCollection.exists()).toBe(true);
        expect(freshCollection.isMarkedForDeletion()).toBe(false);
        expect(Object.keys(engine.documents)).toContain(collection.url);
        expect(Object.keys(engine.documents)).toContain(post.requireDocumentUrl());
    });

    it('fails saving containers with documents marked for deletion', async () => {
        // Arrange
        const engine = new InMemoryEngine();

        setEngine(engine);

        const collection = await PostsCollection.create({ url: 'local://posts/' });
        const post = await collection.relatedPosts.create({ title: 'Hello World' });
        const freshCollection = await PostsCollection.findOrFail(collection.url);

        // Act
        freshCollection.markForDeletion();

        // Assert
        await expect(freshCollection.save()).rejects.toThrow(SoukaiError);

        expect(freshCollection.exists()).toBe(true);
        expect(Object.keys(engine.documents)).toContain(collection.url);
        expect(Object.keys(engine.documents)).toContain(post.requireDocumentUrl());
    });

    it('lists files from remote containers', async () => {
        // Arrange
        const containerUrl = 'https://alice.example/manga/one-piece/001/en/';

        FakeServer.respondOnce(
            containerUrl,
            `
                @prefix ldp: <http://www.w3.org/ns/ldp#> .
                @prefix purl: <http://purl.org/dc/terms/> .
                @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

                <> a ldp:Container ; ldp:contains <index>, <002.png>, <001.png>, <extra/> .

                <index>
                    a ldp:Resource, <http://www.w3.org/ns/iana/media-types/text/turtle#Resource> ;
                    purl:modified "2026-11-17T07:00:00Z"^^xsd:dateTime .

                <001.png>
                    a ldp:Resource, <http://www.w3.org/ns/iana/media-types/image/png#Resource> ;
                    purl:modified "2026-11-17T07:00:00Z"^^xsd:dateTime .

                <002.png>
                    a ldp:Resource, <http://www.w3.org/ns/iana/media-types/image/png#Resource> ;
                    purl:modified "2026-11-17T07:00:00Z"^^xsd:dateTime .

                <extra/> a ldp:Container, ldp:Resource .
            `,
        );

        // Act
        const container = await Container.find(containerUrl);

        // Assert
        const resources = container?.resources ?? [];

        expect(arraySorted(container?.fileUrls ?? [])).toEqual([`${containerUrl}001.png`, `${containerUrl}002.png`]);
        expect(resources.find((resource) => resource.url === `${containerUrl}001.png`)?.mimeType).toEqual('image/png');
        expect(resources.find((resource) => resource.url === `${containerUrl}index`)?.isFile()).toBe(false);
    });

    it('lists files from local containers', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const containerUrl = 'https://alice.example/manga/one-piece/001/en/';

        setEngine(engine);

        await engine.writeFile(`${containerUrl}001.png`, new Blob(['page'], { type: 'image/png' }));

        // Act
        const container = await Container.find(containerUrl);

        // Assert
        expect(container?.fileUrls).toEqual([`${containerUrl}001.png`]);
    });

    it('reads files', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const containerUrl = 'https://alice.example/manga/one-piece/001/en/';

        setEngine(engine);

        await engine.writeFile(`${containerUrl}001.png`, new Blob(['first page'], { type: 'image/png' }));
        await engine.updateFile(`${containerUrl}002.png`, { mimeType: 'image/png', availableOffline: false });

        FakeServer.respondOnce(`${containerUrl}002.png`, new Response('second page'));

        // Act
        const container = await Container.find(containerUrl);
        const files = arraySorted(container?.files ?? [], 'url');
        const contents = await Promise.all(files.map(async (file) => (await file.blob()).text()));

        // Assert
        expect(files.map((file) => file.url)).toEqual([`${containerUrl}001.png`, `${containerUrl}002.png`]);
        expect(files.map((file) => file.mimeType)).toEqual(['image/png', 'image/png']);
        expect(contents).toEqual(['first page', 'second page']);
    });

    it('uploads files', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const containerUrl = 'https://alice.example/galleries/holidays/';
        const uploadedUrls: string[] = [];

        setEngine(engine);

        await engine.writeFile(`${containerUrl}mountain.png`, new Blob(['mountain'], { type: 'image/png' }));

        const container = await Container.find(containerUrl);

        Container.on('file-uploaded', ({ url }) => uploadedUrls.push(url));

        // Act
        const url = await container?.uploadFile(new Blob(['beach'], { type: 'image/png' }), { slug: 'beach.png' });

        // Assert
        expect(url).toEqual(`${containerUrl}beach.png`);
        expect(uploadedUrls).toEqual([url]);
        expect(arraySorted(container?.fileUrls ?? [])).toEqual([
            `${containerUrl}beach.png`,
            `${containerUrl}mountain.png`,
        ]);
        expect(container?.isDirty()).toBe(false);
        expect(await (await engine.readFile(`${containerUrl}beach.png`)).text()).toEqual('beach');
    });

    it('deletes files', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const containerUrl = 'https://alice.example/galleries/holidays/';
        const fileUrl = `${containerUrl}beach.png`;
        const deletedUrls: string[] = [];

        setEngine(engine);

        await engine.writeFile(fileUrl, new Blob(['beach'], { type: 'image/png' }));

        const container = await Container.find(containerUrl);

        Container.on('file-deleted', ({ url }) => deletedUrls.push(url));

        // Act
        await container?.deleteFile(fileUrl);

        // Assert
        expect(deletedUrls).toEqual([fileUrl]);
        expect(container?.fileUrls).toEqual([]);
        expect(await engine.readFileIfExists(fileUrl)).toBeNull();
    });

    it('does not delete files from other containers', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const fileUrl = 'https://alice.example/galleries/work/office.png';

        setEngine(engine);

        await engine.writeFile(fileUrl, new Blob(['office'], { type: 'image/png' }));
        await engine.writeFile('https://alice.example/galleries/holidays/beach.png', new Blob(['beach']));

        const container = await Container.find('https://alice.example/galleries/holidays/');

        // Act
        const deletion = container?.deleteFile(fileUrl);

        // Assert
        await expect(deletion).rejects.toThrow(SoukaiError);
        expect(await engine.getFile(fileUrl)).not.toBeNull();
    });

    describe('computed attributes', () => {
        class Gallery extends defineSchema({
            rdfContext: 'https://schema.org/',
            rdfClass: 'ImageGallery',
            fields: { name: string() },
            relations: { container: isContainedBy('Container') },
            computed: {
                imageUrls: {
                    invalidationStrategy: InvalidationStrategies.Container,
                    compute: (gallery): string[] => arraySorted(loaded(gallery, 'container')?.fileUrls ?? []),
                },
            },
        }) {}

        const containerUrl = 'https://alice.example/galleries/holidays/';
        let engine: InMemoryEngine;

        beforeAll(() => bootModels({ Gallery }));

        beforeEach(() => {
            engine = new InMemoryEngine();

            setEngine(engine);
            ComputedAttribute.enableLoadingRelations();

            return () => ComputedAttribute.disableLoadingRelations();
        });

        it('refreshes computed attributes after uploading files to related containers', async () => {
            // Arrange
            const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });
            const imageUrls = gallery.getComputedAttribute('imageUrls');

            await gallery.loadRelation('container');
            await imageUrls.updateValue();

            // Act
            await gallery.relatedContainer.uploadFile(new Blob(['beach'], { type: 'image/png' }), {
                slug: 'beach.png',
            });

            // Assert
            expect(imageUrls.value).toEqual([`${containerUrl}beach.png`]);
            expect(gallery.container?.fileUrls).toEqual([`${containerUrl}beach.png`]);
        });

        it('does not upload files to related containers of models that do not exist', async () => {
            // Arrange
            const gallery = new Gallery({ url: `${containerUrl}index#it`, name: 'Holidays' });

            // Act
            const upload = gallery.relatedContainer.uploadFile(new Blob(['beach']), { slug: 'beach.png' });

            // Assert
            await expect(upload).rejects.toThrow(SoukaiError);
            expect(await engine.getFile(`${containerUrl}beach.png`)).toBeNull();
        });

        it('does not upload files to related containers before loading them', async () => {
            // Arrange
            const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });

            // Act
            const upload = gallery.relatedContainer.uploadFile(new Blob(['beach']), { slug: 'beach.png' });

            // Assert
            await expect(upload).rejects.toThrow(SoukaiError);
            expect(await engine.getFile(`${containerUrl}beach.png`)).toBeNull();
        });

        it('refreshes computed attributes after deleting files from loaded related containers', async () => {
            // Arrange
            const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });
            const imageUrls = gallery.getComputedAttribute('imageUrls');

            await engine.writeFile(`${containerUrl}beach.png`, new Blob(['beach'], { type: 'image/png' }));
            await engine.writeFile(`${containerUrl}mountain.png`, new Blob(['mountain'], { type: 'image/png' }));
            await gallery.loadRelation('container');
            await imageUrls.updateValue();

            // Act
            await gallery.relatedContainer.deleteFile(`${containerUrl}beach.png`);

            // Assert
            expect(imageUrls.value).toEqual([`${containerUrl}mountain.png`]);
            expect(gallery.container?.fileUrls).toEqual([`${containerUrl}mountain.png`]);
        });
    });
});

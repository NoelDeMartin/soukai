import { FakeServer } from '@noeldemartin/testing';
import { arraySorted } from '@noeldemartin/utils';
import { setEngine } from 'soukai-bis/engines';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Gallery from 'soukai-bis/models/ldp/testing/stubs/Gallery';
import { trackLocalChanges } from 'soukai-bis/models/local-changes';
import { useSolidEngine } from 'soukai-bis/testing/utils/engines';
import { describe, expect, it } from 'vite-plus/test';

import Container from './Container';

describe('Container files', () => {
    useSolidEngine();

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

    it('records local changes for files of models tracking them', async () => {
        // Arrange
        const engine = new InMemoryEngine();

        setEngine(engine);

        const gallery = await new Gallery({ name: 'Holidays' }).save({
            containerUrl: 'https://alice.example/gallery/',
        });

        trackLocalChanges(Gallery);

        await gallery.loadRelation('container');

        // Act
        const url = await gallery.relatedContainer.uploadFile(new File(['image'], 'image.png', { type: 'image/png' }));

        // Assert
        expect(await engine.getDocumentLocalChanges(url)).toEqual({
            resources: { [url]: { createdAt: expect.any(Date) } },
        });
    });

    it('records local changes for deleted files of models tracking them', async () => {
        // Arrange
        const engine = new InMemoryEngine();
        const url = 'https://alice.example/gallery/image.png';

        setEngine(engine);

        const gallery = await new Gallery({ name: 'Holidays' }).save({
            containerUrl: 'https://alice.example/gallery/',
        });

        await engine.writeFile(url, new Blob(['image'], { type: 'image/png' }), { lastModifiedAt: new Date() });
        trackLocalChanges(Gallery);
        await gallery.loadRelation('container');

        // Act
        await gallery.relatedContainer.deleteFile(url);

        // Assert
        expect(await engine.getDocumentLocalChanges(url)).toEqual({
            resources: { [url]: { deletedAt: expect.any(Date) } },
        });
    });

    it('does not record local changes for files of models without tracking', async () => {
        // Arrange
        const engine = new InMemoryEngine();

        setEngine(engine);

        const gallery = await new Gallery({ name: 'Holidays' }).save({
            containerUrl: 'https://alice.example/gallery/',
        });

        await gallery.loadRelation('container');

        const url = await gallery.relatedContainer.uploadFile(new File(['image'], 'image.png', { type: 'image/png' }));
        const uploadChanges = await engine.getDocumentLocalChanges(url);

        // Act
        await gallery.relatedContainer.deleteFile(url);

        // Assert
        expect(uploadChanges).toBeNull();
        expect(await engine.getLocalFile(url)).toBeNull();
        expect(await engine.getDocumentLocalChanges(url)).toBeNull();
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
        expect(await engine.getLocalFile(fileUrl)).not.toBeNull();
    });
});

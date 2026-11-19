import { FakeResponse, fakeContainerUrl } from '@noeldemartin/testing';
import InMemoryEngine from 'soukai-bis/engines/InMemoryEngine';
import SolidEngine from 'soukai-bis/engines/SolidEngine';
import { setEngine } from 'soukai-bis/engines/state';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { deleteFile, isRDFMediaType, uploadFile } from './files';

describe('Files', () => {
    let engine: InMemoryEngine;

    beforeEach(() => setEngine((engine = new InMemoryEngine())));

    it('uploads files to containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const file = new File(['page'], '001 page.png', { type: 'image/png' });

        // Act
        const url = await uploadFile(containerUrl, file);

        // Assert
        expect(url).toEqual(`${containerUrl}001%20page.png`);
        expect(await (await engine.readFile(url)).text()).toEqual('page');
        expect(await engine.getDocumentLocalChanges(url)).toEqual({
            resources: { [url]: { createdAt: new Date() } },
        });
    });

    it('uploads files with unique names', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const firstUrl = await uploadFile(containerUrl, new File(['first'], '001.png'));

        // Act
        const secondUrl = await uploadFile(containerUrl, new File(['second'], '001.png'));

        // Assert
        expect(firstUrl).toEqual(`${containerUrl}001.png`);
        expect(secondUrl).toMatch(new RegExp(`^${containerUrl}001-[\\w-]+\\.png$`));
        expect(await (await engine.readFile(firstUrl)).text()).toEqual('first');
        expect(await (await engine.readFile(secondUrl)).text()).toEqual('second');
    });

    it('overwrites files', async () => {
        // Arrange
        const url = `${fakeContainerUrl()}001.png`;

        await engine.writeFile(url, new Blob(['first']), { lastModifiedAt: new Date() });

        // Act
        await uploadFile(url, new Blob(['second']), { overwrite: true });

        // Assert
        expect(await (await engine.readFile(url)).text()).toEqual('second');
        expect(await engine.getDocumentLocalChanges(url)).toEqual({
            resources: { [url]: { updatedAt: new Date() } },
        });
    });

    it('deletes files', async () => {
        // Arrange
        const url = await uploadFile(fakeContainerUrl(), new File(['page'], '001.png'));

        // Act
        await deleteFile(url);

        // Assert
        expect(await engine.getFile(url)).toBeNull();
        expect(await engine.getDocumentLocalChanges(url)).toBeNull();
    });

    it('uploads files to remote engines', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const requests: { url: string; method?: string }[] = [];

        setEngine(
            new SolidEngine({
                fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
                    requests.push({ url: String(url), method: init?.method });

                    return String(url) === `${containerUrl}001.png`
                        ? new FakeResponse('', {}, 412)
                        : FakeResponse.created();
                },
            }),
        );

        // Act
        const url = await uploadFile(containerUrl, new File(['page'], '001.png', { type: 'image/png' }));

        // Assert
        expect(url).toMatch(new RegExp(`^${containerUrl}001-[\\w-]+\\.png$`));
        expect(requests).toEqual([
            { url: `${containerUrl}001.png`, method: 'PUT' },
            { url, method: 'PUT' },
        ]);
    });

    it('detects RDF media types', () => {
        expect(isRDFMediaType('text/turtle')).toBe(true);
        expect(isRDFMediaType('Text/Turtle; charset=utf-8')).toBe(true);
        expect(isRDFMediaType('image/png')).toBe(false);
    });
});

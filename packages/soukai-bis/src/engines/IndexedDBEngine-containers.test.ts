import { faker } from '@noeldemartin/faker';
import { expandIRI, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { deleteDB } from 'idb';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, LDP_CONTAINS_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import { getNamespace } from 'soukai-bis/lib/namespace';
import SetPropertyOperation from 'soukai-bis/models/crdts/SetPropertyOperation';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

import IndexedDBEngine from './IndexedDBEngine';
import { getDatabaseDocuments, setDatabaseDocument } from './testing/helpers';

describe('IndexedDBEngine containers', () => {
    let engine: IndexedDBEngine;

    beforeEach(() => {
        engine = new IndexedDBEngine();
    });

    it('creates containers', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                ],
            },
        });
    });

    it('creates containers with meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const name = faker.name.firstName();

        // Act
        await engine.createDocument(containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': fakeDocumentUrl() },
        });

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                    { p: expandIRI('rdfs:label'), o: { v: name } },
                ],
            },
        });
    });

    it('updates containers', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl();

        await setDatabaseDocument(parentUrl, containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
        ]);

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                ],
            },
        });
    });

    it('updates containers meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();

        await setDatabaseDocument(parentUrl, containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: faker.name.firstName(),
        });

        // Act
        await engine.updateDocument(containerUrl, [
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: LDP_CONTAINS_PREDICATE.value,
                value: [documentUrl],
                date: new Date(),
            }).setNamedNode(true),
            new SetPropertyOperation({
                resourceUrl: containerUrl,
                property: expandIRI('rdfs:label'),
                value: [name],
                date: new Date(),
            }),
        ]);

        // Assert
        const documents = await getDatabaseDocuments(parentUrl);

        expect(documents).toHaveLength(1);
        expect(documents[0]).toEqual({
            url: containerUrl,
            containerUrl: parentUrl,
            resources: {
                [containerUrl]: [
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_CONTAINER },
                    { p: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', o: LDP_BASIC_CONTAINER },
                    { p: expandIRI('rdfs:label'), o: { v: name } },
                ],
            },
        });
    });

    it('reads containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const documentUrl = fakeDocumentUrl({ containerUrl });

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': documentUrl },
        });
    });

    it('reads virtual containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
        const grandchildContainerUrl = fakeContainerUrl({ baseUrl: childContainerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: grandchildContainerUrl });

        await setDatabaseDocument(grandchildContainerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': childContainerUrl },
        });
    });

    it('reads parent containers', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: containerUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl: childContainerUrl });

        await setDatabaseDocument(containerUrl, childContainerUrl, { '@id': containerUrl });
        await setDatabaseDocument(childContainerUrl, documentUrl, { '@id': documentUrl });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        expect(container.getQuads()).toHaveLength(3);

        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [LDP_CONTAINS]: { '@id': childContainerUrl },
        });
    });

    it('reads containers with meta', async () => {
        // Arrange
        const parentUrl = fakeContainerUrl();
        const containerUrl = fakeContainerUrl({ baseUrl: parentUrl });
        const documentUrl = fakeDocumentUrl({ containerUrl });
        const name = faker.name.firstName();

        await setDatabaseDocument(containerUrl, documentUrl, { '@id': documentUrl });
        await setDatabaseDocument(parentUrl, containerUrl, {
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
        });

        // Act
        const container = await engine.readDocument(containerUrl);

        // Assert
        await expect(await quadsToJsonLD(container.getQuads())).toEqualJsonLD({
            '@id': containerUrl,
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            [expandIRI('rdfs:label')]: name,
            [LDP_CONTAINS]: { '@id': documentUrl },
        });
    });

    it('drops containers', async () => {
        // Arrange
        const containerUrls = [fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl(), fakeContainerUrl()] as const;
        const documentUrl = fakeDocumentUrl({ containerUrl: containerUrls[0] });

        await setDatabaseDocument(containerUrls[0], documentUrl, {
            '@id': documentUrl,
        });

        await engine.createDocument(containerUrls[1], {
            '@id': containerUrls[1],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[2], {
            '@id': containerUrls[2],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });
        await engine.createDocument(containerUrls[3], {
            '@id': containerUrls[3],
            '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
        });

        // Act
        await engine.dropContainers([containerUrls[0], containerUrls[1]]);

        // Assert
        await expect(engine.readDocument(documentUrl)).rejects.toBeInstanceOf(DocumentNotFound);

        await engine.close();
    });

    it('gets nested container urls', async () => {
        // Arrange
        const rootContainerUrl = fakeContainerUrl();
        const childContainerUrl = fakeContainerUrl({ baseUrl: rootContainerUrl });
        const virtualChildContainerUrl = fakeContainerUrl({ baseUrl: fakeContainerUrl() });

        await setDatabaseDocument(rootContainerUrl, fakeDocumentUrl({ containerUrl: rootContainerUrl }), {});
        await setDatabaseDocument(childContainerUrl, fakeDocumentUrl({ containerUrl: childContainerUrl }), {});
        await setDatabaseDocument(
            virtualChildContainerUrl,
            fakeDocumentUrl({ containerUrl: virtualChildContainerUrl }),
            {},
        );

        // Act
        const containerUrls = await engine.getContainerUrls();

        // Assert
        expect(containerUrls).toHaveLength(3);
        expect(containerUrls).toEqual(
            expect.arrayContaining([rootContainerUrl, childContainerUrl, virtualChildContainerUrl]),
        );
    });

    it('resets containers index when the database is deleted from another context', async () => {
        // Arrange
        const containerUrl = fakeContainerUrl();

        await engine.createDocument(fakeDocumentUrl({ containerUrl }), {
            '@id': `${fakeDocumentUrl({ containerUrl })}#it`,
            '@type': expandIRI('foaf:Person'),
        });

        // Act
        await deleteDB(getNamespace());
        await engine.createDocument(fakeDocumentUrl({ containerUrl }), {
            '@id': `${fakeDocumentUrl({ containerUrl })}#it`,
            '@type': expandIRI('foaf:Person'),
        });

        // Assert
        const db = await SoukaiIndexedDB.connect();
        const containers = await db.getAll('containers');

        expect(containers).toEqual([{ url: containerUrl }]);
    });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeContainerUrl, fakeDocumentUrl } from '@noeldemartin/testing';
import { faker } from '@noeldemartin/faker';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import { SetPropertyOperation } from 'soukai-bis/models/crdts';
import { RDFLiteral, RDFNamedNode } from '@noeldemartin/solid-utils';

import InMemoryEngine from './InMemoryEngine';

describe('InMemoryEngine', () => {

    let engine: InMemoryEngine;

    beforeEach(() => {
        engine = new InMemoryEngine();
    });

    it('creates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        };

        await engine.createDocument(documentUrl, document);

        expect(engine.documents[documentUrl]).toEqual(document);
    });

    it('fails creating documents when they already exist', async () => {
        const documentUrl = fakeDocumentUrl();

        await engine.createDocument(documentUrl, {});

        await expect(engine.createDocument(documentUrl, {})).rejects.toBeInstanceOf(DocumentAlreadyExists);
    });

    it('updates documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const newName = faker.name.firstName();

        await engine.createDocument(documentUrl, {
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        });

        await engine.updateDocument(documentUrl, [
            new SetPropertyOperation(
                new RDFNamedNode(`${documentUrl}#it`),
                new RDFNamedNode('http://xmlns.com/foaf/0.1/name'),
                new RDFLiteral(newName),
            ),
        ]);

        await expect(engine.documents[documentUrl]).toEqualJsonLD({
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': newName,
        });
    });

    it('reads many documents', async () => {
        const containerUrl = fakeContainerUrl();
        const firstDocumentUrl = fakeDocumentUrl({ containerUrl });
        const secondDocumentUrl = fakeDocumentUrl({ containerUrl });
        const firstName = faker.name.firstName();
        const secondName = faker.name.firstName();

        await engine.createDocument(firstDocumentUrl, {
            '@id': `${firstDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': firstName,
        });

        await engine.createDocument(secondDocumentUrl, {
            '@id': `${secondDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': secondName,
        });

        const documents = await engine.readManyDocuments(containerUrl);

        expect(Object.keys(documents)).toHaveLength(2);
        expect(documents[firstDocumentUrl]).toEqual({
            '@id': `${firstDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': firstName,
        });
        expect(documents[secondDocumentUrl]).toEqual({
            '@id': `${secondDocumentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': secondName,
        });
    });

    it('reads one document', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        };

        await engine.createDocument(documentUrl, document);

        const readDocument = await engine.readOneDocument(documentUrl);

        expect(readDocument).toEqual(document);
    });

    it('deletes documents', async () => {
        const documentUrl = fakeDocumentUrl();
        const name = faker.name.firstName();
        const document: JsonLD = {
            '@id': `${documentUrl}#it`,
            '@type': 'http://xmlns.com/foaf/0.1/Person',
            'http://xmlns.com/foaf/0.1/name': name,
        };

        await engine.createDocument(documentUrl, document);

        await engine.deleteDocument(documentUrl);

        expect(engine.documents[documentUrl]).toBeUndefined();
    });

});

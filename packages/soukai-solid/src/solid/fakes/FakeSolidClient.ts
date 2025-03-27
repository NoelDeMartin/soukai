import { vi } from 'vitest';
import type { MockInstance } from 'vitest';

import RDFDocument from 'soukai-solid/solid/RDFDocument';
import { facade, urlResolve, uuid } from '@noeldemartin/utils';
import SolidClient from 'soukai-solid/solid/SolidClient';
import type RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';
import type { Fetch, ResponseMetadata } from 'soukai-solid/solid/SolidClient';

export class FakeSolidClientInstance extends SolidClient {

    public getDocumentSpy: MockInstance;
    public getDocumentsSpy: MockInstance;
    public updateDocumentSpy: MockInstance;
    public overwriteDocumentSpy: MockInstance;
    public deleteDocumentSpy: MockInstance;
    public documentExistsSpy: MockInstance;
    public createDocumentSpy: MockInstance;

    private documents: Record<string, RDFDocument[]> = {};

    constructor() {
        super();

        this.getDocumentSpy = vi.spyOn(this as FakeSolidClientInstance, 'getDocument');
        this.getDocumentsSpy = vi.spyOn(this as FakeSolidClientInstance, 'getDocuments');
        this.updateDocumentSpy = vi.spyOn(this as FakeSolidClientInstance, 'updateDocument');
        this.overwriteDocumentSpy = vi.spyOn(this as FakeSolidClientInstance, 'overwriteDocument');
        this.deleteDocumentSpy = vi.spyOn(this as FakeSolidClientInstance, 'deleteDocument');
        this.documentExistsSpy = vi.spyOn(this as FakeSolidClientInstance, 'documentExists');
        this.createDocumentSpy = vi.spyOn(this as FakeSolidClientInstance, 'createDocument');
    }

    public getFetch(): Fetch {
        throw new Error('not implemented');
    }

    public setConfig(): void {
        // Nothing to do here.
    }

    public async createDocument(
        parentUrl: string,
        url: string | null = null,
        properties: RDFResourceProperty[] = [],
    ): Promise<{ url: string; metadata: ResponseMetadata }> {
        const turtleData = properties.map((property) => property.toTurtle() + ' .').join('\n');

        if (url === null) url = urlResolve(parentUrl, uuid());

        if (await this.documentExists(url)) throw new Error(`Cannot create a document at ${url}, url already in use`);

        const document = await RDFDocument.fromTurtle(turtleData, { baseIRI: url });

        this.documents[url] = [document];

        return { url, metadata: { headers: new Headers() } };
    }

    public async getDocument(url: string): Promise<RDFDocument | null> {
        return this.documents[url]?.[0] ?? null;
    }

    public async getDocuments(containerUrl: string): Promise<RDFDocument[]> {
        const documents: RDFDocument[] = [];

        for (const containerDocuments of Object.values(this.documents)) {
            for (const document of containerDocuments) {
                if (!document.url?.startsWith(containerUrl)) continue;

                documents.push(document);
            }
        }

        return documents;
    }

    public async updateDocument(url: string): Promise<ResponseMetadata | undefined> {
        if (!(url in this.documents)) throw new Error(`Error updating document at ${url}, returned 404 status code`);

        return { headers: new Headers() };
    }

    public async overwriteDocument(url: string, properties: RDFResourceProperty[]): Promise<ResponseMetadata> {
        const turtleData = properties.map((property) => property.toTurtle() + ' .').join('\n');

        const document = await RDFDocument.fromTurtle(turtleData, { baseIRI: url });
        this.documents[url] = [document];

        return { headers: new Headers() };
    }

    public async deleteDocument(url: string): Promise<ResponseMetadata | undefined> {
        if (!(url in this.documents)) return;

        delete this.documents[url];
        return { headers: new Headers() };
    }

    public async documentExists(url: string): Promise<boolean> {
        return Object.entries(this.documents).some(
            ([documentUrl, urlDocuments]) =>
                url.startsWith(documentUrl) && urlDocuments.some((document) => document.url === url),
        );
    }

}

export default facade(FakeSolidClientInstance);

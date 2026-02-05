import { SolidClient, SparqlUpdate, jsonldToQuads, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { Fetch, JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import type Operation from 'soukai-bis/models/crdts/Operation';

import Engine from './Engine';

export default class SolidEngine extends Engine {

    private client: SolidClient;

    public constructor(fetch?: Fetch) {
        super();

        this.client = new SolidClient({ fetch });
    }

    public async createDocument(url: string, contents: JsonLD | Quad[]): Promise<void> {
        if (await this.client.exists(url)) {
            throw new DocumentAlreadyExists(url);
        }

        const originalQuads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const quads = url.endsWith('/') ? this.filterContainerQuads(originalQuads) : originalQuads;
        const body = quadsToTurtle(quads);

        await this.client.create(url, body, { method: url.endsWith('/') ? 'PUT' : 'PATCH' });
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        operations = url.endsWith('/') ? this.filterContainerOperations(operations) : operations;

        if (operations.length === 0) {
            return;
        }

        const document = await this.client.readIfFound(url);

        if (!document) {
            throw new DocumentNotFound(url);
        }

        const sparql = new SparqlUpdate(document);

        for (const operation of operations) {
            operation.applyToSparql(sparql);
        }

        await this.client.update(url.endsWith('/') ? document.getDescriptionUrl() : url, sparql, {
            base: url,
        });
    }

    public async readDocument(url: string): Promise<SolidDocument> {
        const document = await this.client.readIfFound(url);

        if (!document) {
            throw new DocumentNotFound(url);
        }

        return document;
    }

    public async deleteDocument(url: string): Promise<void> {
        await this.client.delete(url);
    }

}

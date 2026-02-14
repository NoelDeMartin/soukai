import { SolidClient, SparqlUpdate, jsonldToQuads, quadsToTurtle } from '@noeldemartin/solid-utils';
import { isDevelopment, isTesting } from '@noeldemartin/utils';
import type { Fetch, JsonLD, SolidDocument } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Operation from 'soukai-bis/models/crdts/Operation';

import Engine from './Engine';
import { classMarker } from './utils';

export default class SolidEngine extends Engine {

    public static [classMarker] = 'SolidEngine';

    private client: SolidClient;

    public constructor(fetch?: Fetch) {
        super();

        this.client = new SolidClient({ fetch });
    }

    public getFetch(): Fetch | null {
        return this.client.getFetch();
    }

    public async createDocument(url: string, contents: JsonLD | Quad[], metadata?: unknown): Promise<SolidDocument> {
        if (metadata) {
            const message = 'SolidEngine does not support metadata creation (it will be handled by the Solid Server)';

            if (isDevelopment() || isTesting()) {
                throw new SoukaiError(message);
            }

            // eslint-disable-next-line no-console
            console.warn(message);
        }

        if (await this.client.exists(url)) {
            throw new DocumentAlreadyExists(url);
        }

        const originalQuads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const quads = url.endsWith('/') ? this.filterContainerQuads(originalQuads) : originalQuads;
        const body = quadsToTurtle(quads);

        return this.client.create(url, body, { method: url.endsWith('/') ? 'PUT' : 'PATCH' });
    }

    public async updateDocument(url: string, operations: Operation[], metadata?: unknown): Promise<void> {
        if (metadata) {
            const message = 'SolidEngine does not support metadata updates (they will be handled by the Solid Server)';

            if (isDevelopment() || isTesting()) {
                throw new SoukaiError(message);
            }

            // eslint-disable-next-line no-console
            console.warn(message);
        }

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

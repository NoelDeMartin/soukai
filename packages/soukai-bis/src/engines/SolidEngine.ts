import { SolidClient, SparqlUpdate, jsonldToQuads, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { Fetch, JsonLD, JsonLDGraph, SolidDocument, SolidResponse } from '@noeldemartin/solid-utils';
import { Semaphore } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';

import Engine from './Engine';
import type { CreateDocumentInContainerOptions } from './Engine';
import { CLASS_MARKER } from './internals';
import type EngineOperation from './operations/EngineOperation';

export interface SolidEngineConfig {
    fetch?: Nullable<Fetch>;
    concurrency?: Nullable<number>;
}

export default class SolidEngine extends Engine {
    public static readonly engineName = 'SolidEngine';
    public static [CLASS_MARKER] = 'SolidEngine';

    private client: SolidClient;
    private lock: Semaphore;

    public constructor(config: SolidEngineConfig = {}) {
        super();

        this.client = new SolidClient({ fetch: config.fetch ?? undefined });
        this.lock = new Semaphore(config.concurrency ?? 10);
    }

    public getFetch(): Fetch | null {
        return this.client.getFetch();
    }

    public requireFetch(): Fetch {
        return this.getFetch() ?? globalThis.fetch.bind(globalThis);
    }

    public async createDocument(url: string, contents: JsonLD | JsonLDGraph | Quad[]): Promise<SolidDocument> {
        return this.lock.run(async () => {
            const existingDocument = await this.client.readIfFound(url);

            if (existingDocument) {
                throw new DocumentAlreadyExists(url, existingDocument);
            }

            const originalQuads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
            const quads = url.endsWith('/') ? this.filterContainerQuads(originalQuads) : originalQuads;
            const body = quadsToTurtle(quads);

            return this.client.create(url, body, { method: url.endsWith('/') ? 'PUT' : 'PATCH' });
        });
    }

    public override async createDocumentInContainer(
        containerUrl: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        { proposedUrl }: CreateDocumentInContainerOptions = {},
    ): Promise<SolidDocument> {
        const slug = proposedUrl ? this.assertContainerDocumentSlug(containerUrl, proposedUrl) : undefined;

        return this.lock.run(async () => {
            const quads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);

            return this.client.createInContainer(containerUrl, quads, {
                slug,
                base: proposedUrl ?? undefined,
            });
        });
    }

    public updateDocument(url: string, operations: EngineOperation[]): Promise<SolidResponse | null> {
        return this.lock.run(async () => {
            operations = url.endsWith('/') ? this.filterContainerOperations(operations) : operations;
            operations = this.filterSupersededOperations(operations);

            if (operations.length === 0) {
                return null;
            }

            const document = await this.client.readIfFound(url);

            if (!document) {
                throw new DocumentNotFound(url);
            }

            const sparql = new SparqlUpdate(document);

            for (const operation of operations) {
                operation.applyToSparql(sparql);
            }

            const response = await this.client.update(url.endsWith('/') ? document.getDescriptionUrl() : url, sparql, {
                base: url,
            });

            return response;
        });
    }

    public readDocument(url: string): Promise<SolidDocument> {
        return this.lock.run(async () => {
            const document = await this.client.readIfFound(
                url,
                url.endsWith('/')
                    ? {
                          cache: 'reload',
                          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
                      }
                    : undefined,
            );

            if (!document) {
                throw new DocumentNotFound(url);
            }

            return document;
        });
    }

    public deleteDocument(url: string): Promise<SolidResponse> {
        return this.lock.run(() => this.client.delete(url));
    }
}

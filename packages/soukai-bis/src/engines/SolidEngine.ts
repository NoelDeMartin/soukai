import {
    NotFound,
    SolidClient,
    SparqlUpdate,
    UnsuccessfulNetworkRequest,
    jsonldToQuads,
    quadsToTurtle,
} from '@noeldemartin/solid-utils';
import type { Fetch, JsonLD, JsonLDGraph, SolidDocument, SolidResponse } from '@noeldemartin/solid-utils';
import { Semaphore, isInstanceOf } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';

import Engine from './Engine';
import type { FileWriteOptions } from './Engine';
import { CLASS_MARKER } from './internals';
import type EngineOperation from './operations/EngineOperation';

export interface SolidEngineConfig {
    fetch?: Nullable<Fetch>;
    concurrency?: Nullable<number>;
}

export interface SolidEngineFileOptions {
    ifUnmodifiedSince?: Date;
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
        proposedUrl: string,
        contents: JsonLD | JsonLDGraph | Quad[],
    ): Promise<SolidDocument> {
        const slug = this.assertContainerDocumentSlug(containerUrl, proposedUrl);

        return this.lock.run(async () => {
            const quads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);

            return this.client.createInContainer(containerUrl, quads, { slug, base: proposedUrl });
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

    public writeFile(
        url: string,
        blob: Blob,
        options: FileWriteOptions & SolidEngineFileOptions = {},
    ): Promise<SolidResponse> {
        this.assertFileUrl(url);

        return this.lock.run(async () => {
            try {
                return await this.client.uploadFile(url, blob, {
                    contentType: options.mimeType,
                    headers: this.getFileHeaders(options),
                });
            } catch (error) {
                if (isInstanceOf(error, UnsuccessfulNetworkRequest) && error.response.status === 412) {
                    throw new PreconditionFailed('writing', url);
                }

                throw error;
            }
        });
    }

    public createFile(url: string, blob: Blob, options: FileWriteOptions = {}): Promise<SolidResponse> {
        this.assertFileUrl(url);

        return this.lock.run(async () => {
            try {
                return await this.client.uploadFile(url, blob, { contentType: options.mimeType, overwrite: false });
            } catch (error) {
                if (isInstanceOf(error, UnsuccessfulNetworkRequest) && error.response.status === 412) {
                    throw new FileAlreadyExists(url);
                }

                throw error;
            }
        });
    }

    public override async createFileInContainer(
        containerUrl: string,
        proposedUrl: string,
        blob: Blob,
        options: FileWriteOptions = {},
    ): Promise<string> {
        const slug = this.assertContainerDocumentSlug(containerUrl, proposedUrl);
        const response = await this.lock.run(() =>
            this.client.uploadFileInContainer(containerUrl, blob, {
                slug: decodeURIComponent(slug),
                contentType: options.mimeType,
            }),
        );

        return response.url;
    }

    public readFile(url: string): Promise<Blob> {
        return this.lock.run(async () => {
            try {
                return await this.client.readFile(url);
            } catch (error) {
                if (isInstanceOf(error, NotFound)) {
                    throw new DocumentNotFound(url);
                }

                throw error;
            }
        });
    }

    public deleteFile(url: string, options: SolidEngineFileOptions = {}): Promise<SolidResponse> {
        return this.lock.run(async () => {
            try {
                return await this.client.delete(url, { headers: this.getFileHeaders(options) });
            } catch (error) {
                if (isInstanceOf(error, UnsuccessfulNetworkRequest) && error.response.status === 404) {
                    return { headers: error.response.headers };
                }

                if (isInstanceOf(error, UnsuccessfulNetworkRequest) && error.response.status === 412) {
                    throw new PreconditionFailed('deleting', url);
                }

                throw error;
            }
        });
    }

    private getFileHeaders(options: SolidEngineFileOptions): Record<string, string> | undefined {
        return options.ifUnmodifiedSince
            ? { 'If-Unmodified-Since': options.ifUnmodifiedSince.toUTCString() }
            : undefined;
    }
}

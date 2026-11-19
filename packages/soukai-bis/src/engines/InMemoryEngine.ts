import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD, JsonLDGraph, SolidResponse } from '@noeldemartin/solid-utils';
import { deepEquals, fail, urlParentDirectory } from '@noeldemartin/utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import PreconditionFailed from 'soukai-bis/errors/PreconditionFailed';
import { LDP_CONTAINS_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { requireSafeContainerUrl, safeContainerUrl } from 'soukai-bis/lib/internals/urls';

import LocalEngine from './LocalEngine';
import type {
    DocumentLocalChanges,
    LocalChangesUpdate,
    LocalDocumentStatus,
    LocalEngineDeleteOptions,
    LocalEngineReadOptions,
    LocalEngineWriteOptions,
    PurgeMetadataOptions,
} from './LocalEngine';
import type EngineOperation from './operations/EngineOperation';

export interface InMemoryDocument {
    graph: JsonLD;
    lastModifiedAt?: Nullable<Date>;
    status?: LocalDocumentStatus;
}

export default class InMemoryEngine extends LocalEngine {
    public static readonly engineName = 'InMemoryEngine';

    public documents: Record<string, InMemoryDocument> = {};
    public localChanges: Record<string, DocumentLocalChanges> = {};

    public async createDocument(
        url: string,
        contents: JsonLD | JsonLDGraph | Quad[],
        options?: LocalEngineWriteOptions,
    ): Promise<SolidDocument> {
        await this.assertDocumentDoesNotExist(url);

        const quads = Array.isArray(contents) ? contents : await jsonldToQuads(contents);
        const graph = Array.isArray(contents) ? await quadsToJsonLD(contents) : contents;

        if (url.endsWith('/')) {
            this.removeContainerProperties(graph, { keepTypes: true });
        }

        this.documents[url] = {
            graph,
            lastModifiedAt: options?.lastModifiedAt,
            status: this.getDocumentStatus(url, quads),
        };

        const localChangesUpdated = this.writeLocalChanges(url, options?.localChanges);

        let containerUrl: string | null = url;

        while ((containerUrl = safeContainerUrl(containerUrl)) !== null) {
            this.documents[containerUrl] ??= { graph: await quadsToJsonLD(this.containerQuads(containerUrl)) };
        }

        localChangesUpdated && (await this.emitLocalChangesUpdated());

        return new SolidDocument(url, quads);
    }

    public async readDocument(url: string, options: LocalEngineReadOptions = {}): Promise<SolidDocument> {
        const { graph, status } = this.documents[url] ?? fail<InMemoryDocument>(DocumentNotFound, url);
        const document =
            this.toReadableDocument(url, await jsonldToQuads(graph), status, options) ??
            fail<SolidDocument>(DocumentNotFound, url);

        if (url.endsWith('/')) {
            // oxlint-disable-next-line typescript/no-floating-promises
            this.populateContainer(document, options);
        }

        return document;
    }

    public async updateDocument(
        url: string,
        operations: EngineOperation[],
        options?: LocalEngineWriteOptions,
    ): Promise<SolidResponse | null> {
        const updateOperations = this.filterDocumentOperations(url, operations);

        if (this.isEmptyUpdate(updateOperations, options)) {
            return null;
        }

        const document = this.documents[url];

        if (!document) {
            if (url.endsWith('/')) {
                this.documents[url] = {
                    graph: await quadsToJsonLD(this.containerQuads(url)),
                    lastModifiedAt: options?.lastModifiedAt,
                };

                this.writeLocalChanges(url, options?.localChanges) && (await this.emitLocalChangesUpdated());

                return { headers: new Headers() };
            }

            throw new DocumentNotFound(url);
        }

        const quads = this.applyOperations(await jsonldToQuads(document.graph), updateOperations);

        this.documents[url] = {
            graph: await quadsToJsonLD(quads),
            lastModifiedAt: this.getUpdatedLastModifiedAt(document.lastModifiedAt, options),
            status: this.getDocumentStatus(url, quads),
        };

        this.writeLocalChanges(url, options?.localChanges) && (await this.emitLocalChangesUpdated());

        return { headers: new Headers() };
    }

    public async deleteDocument(url: string, options: LocalEngineDeleteOptions = {}): Promise<SolidResponse> {
        const document = this.documents[url];

        if (!document) {
            throw new DocumentNotFound(url);
        }

        if (options.ifMatch && document.status !== options.ifMatch.status) {
            throw new PreconditionFailed('deleting', url);
        }

        const hadLocalChanges = url in this.localChanges;

        delete this.documents[url];
        delete this.localChanges[url];

        hadLocalChanges && (await this.emitLocalChangesUpdated());

        return { headers: new Headers() };
    }

    public async getDocumentLocalChanges(documentUrl: string): Promise<DocumentLocalChanges | null> {
        const changes = this.localChanges[documentUrl];

        return changes ? structuredClone(changes) : null;
    }

    public async getDocumentsLocalChanges(): Promise<Record<string, DocumentLocalChanges>> {
        return structuredClone(this.localChanges);
    }

    public async getContainerUrls(): Promise<string[]> {
        const containerUrls = new Set<string>();

        for (const documentUrl of Object.keys(this.documents)) {
            if (documentUrl.endsWith('/')) {
                continue;
            }

            containerUrls.add(requireSafeContainerUrl(documentUrl));
        }

        return Array.from(containerUrls);
    }

    public async getDocumentsLastModifiedAt(): Promise<Record<string, Date | null>> {
        const timestamps: Record<string, Date | null> = {};

        for (const [url, document] of Object.entries(this.documents)) {
            timestamps[url] = document.lastModifiedAt ?? null;
        }

        return timestamps;
    }

    public async dropContainers(containerUrls: string[] | RegExp): Promise<void> {
        const containerMatches = this.containerMatcher(containerUrls);

        for (const documentUrl of Object.keys(this.documents)) {
            if (documentUrl.endsWith('/') && containerMatches(documentUrl)) {
                await this.deleteDocument(documentUrl);

                continue;
            }

            const containerUrl = safeContainerUrl(documentUrl);

            if (!containerUrl || !containerMatches(containerUrl)) {
                continue;
            }

            await this.deleteDocument(documentUrl);
        }
    }

    public async purgeMetadata(options: PurgeMetadataOptions = {}): Promise<void> {
        const documentUrls = options.documentUrls ?? Object.keys(this.documents);

        for (const documentUrl of documentUrls) {
            if (!this.documents[documentUrl]?.lastModifiedAt) {
                continue;
            }

            delete this.documents[documentUrl].lastModifiedAt;
        }
    }

    private writeLocalChanges(documentUrl: string, update?: LocalChangesUpdate): boolean {
        if (!update) {
            return false;
        }

        const previousChanges = this.localChanges[documentUrl] ?? null;
        const changes = this.applyLocalChangesUpdate(previousChanges, update);

        if (changes) {
            this.localChanges[documentUrl] = changes;
        } else {
            delete this.localChanges[documentUrl];
        }

        return !deepEquals(previousChanges, changes);
    }

    private async populateContainer(document: SolidDocument, options: LocalEngineReadOptions): Promise<void> {
        const quads: Quad[] = [];
        const subject = new RDFNamedNode(document.url);

        for (const [url, childDocument] of Object.entries(this.documents)) {
            const parentUrl = urlParentDirectory(url);

            if (childDocument.status === 'empty' && !options.includeEmptyDocuments) {
                continue;
            }

            if (!parentUrl || parentUrl !== document.url) {
                continue;
            }

            quads.push(new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(url)));
        }

        document.addQuads(quads);
    }
}

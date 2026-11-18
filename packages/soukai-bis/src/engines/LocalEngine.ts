import { RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import { LDP_BASIC_CONTAINER_OBJECT, LDP_CONTAINER_OBJECT, RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';

import Engine from './Engine';
import { CLASS_MARKER } from './internals';
import type EngineOperation from './operations/EngineOperation';

export type ResourceLocalState = 'created' | 'updated' | 'deleted';

export type ResourceLocalChanges =
    | { state: 'created' | 'updated'; newOperations?: string[] }
    | { state: 'deleted'; deletedOperations?: string[] };

export interface DocumentLocalChanges {
    resources: Record<string, ResourceLocalChanges>;
}

export type LocalChangesUpdate = (changes: DocumentLocalChanges | null) => DocumentLocalChanges | null;

export interface LocalEngineReadOptions {
    includeEmptyDocuments?: boolean;
}

export interface LocalEngineWriteOptions {
    lastModifiedAt?: Nullable<Date>;
    localChanges?: LocalChangesUpdate;
}

export interface LocalEngineDeleteOptions {
    ifMatch?: { status: LocalDocumentStatus };
}

export interface PurgeMetadataOptions {
    documentUrls?: string[];
}

export type LocalDocumentStatus = 'empty';

export default abstract class LocalEngine extends Engine<
    LocalEngineReadOptions,
    LocalEngineWriteOptions,
    LocalEngineDeleteOptions
> {
    public static [CLASS_MARKER] = 'LocalEngine';

    public abstract getContainerUrls(): Promise<string[]>;

    public abstract dropContainers(containerUrls: string[] | RegExp): Promise<void>;

    public abstract getDocumentsLastModifiedAt(): Promise<Record<string, Date | null>>;

    public abstract purgeMetadata(options?: PurgeMetadataOptions): Promise<void>;

    public abstract getDocumentLocalChanges(documentUrl: string): Promise<DocumentLocalChanges | null>;

    public abstract getDocumentsLocalChanges(): Promise<Record<string, DocumentLocalChanges>>;

    protected applyLocalChangesUpdate(
        changes: DocumentLocalChanges | null,
        update: LocalChangesUpdate,
    ): DocumentLocalChanges | null {
        const updatedChanges = update(changes && structuredClone(changes));

        return updatedChanges && Object.keys(updatedChanges.resources).length > 0 ? updatedChanges : null;
    }

    protected async assertDocumentDoesNotExist(url: string): Promise<void> {
        const existingDocument = await this.readDocumentIfExists(url, { includeEmptyDocuments: true });

        if (existingDocument) {
            throw new DocumentAlreadyExists(url, existingDocument);
        }
    }

    protected filterDocumentOperations(url: string, operations: EngineOperation[]): EngineOperation[] {
        return url.endsWith('/') ? this.filterContainerOperations(operations) : operations;
    }

    protected isEmptyUpdate(operations: EngineOperation[], options?: LocalEngineWriteOptions): boolean {
        return operations.length === 0 && !options?.lastModifiedAt && !options?.localChanges;
    }

    protected getUpdatedLastModifiedAt(
        storedLastModifiedAt: Nullable<Date>,
        options?: LocalEngineWriteOptions,
    ): Nullable<Date> {
        return options?.lastModifiedAt === undefined ? storedLastModifiedAt : options.lastModifiedAt;
    }

    protected applyOperations(quads: Quad[], operations: EngineOperation[]): Quad[] {
        return operations.reduce((updatedQuads, operation) => operation.applyToQuads(updatedQuads), quads);
    }

    protected getDocumentStatus(url: string, quads: Quad[]): LocalDocumentStatus | undefined {
        return quads.length === 0 && !url.endsWith('/') ? 'empty' : undefined;
    }

    protected toReadableDocument(
        url: string,
        quads: Quad[],
        status: LocalDocumentStatus | undefined,
        options: LocalEngineReadOptions = {},
    ): SolidDocument | null {
        if (status === 'empty' && !options.includeEmptyDocuments) {
            return null;
        }

        return new SolidDocument(url, quads);
    }

    protected containerQuads(url: string): Quad[] {
        const subject = new RDFNamedNode(url);

        return [
            new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT),
            new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT),
        ];
    }

    protected containerMatcher(containerUrls: string[] | RegExp): (url: string) => boolean {
        return Array.isArray(containerUrls)
            ? (url: string) => containerUrls.includes(url)
            : (url: string) => containerUrls.test(url);
    }
}

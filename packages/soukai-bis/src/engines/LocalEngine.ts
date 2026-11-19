import { RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import { ListenersManager } from '@noeldemartin/utils';
import type { Listeners, Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import {
    CRDT_DATE_PREDICATE,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/lib/internals/rdf';

import Engine from './Engine';
import { CLASS_MARKER } from './internals';
import { getResourceLocalChangesDate } from './local-changes';
import type EngineOperation from './operations/EngineOperation';

export type LocalDocumentStatus = 'empty';
export type LocalChangesUpdate = (changes: DocumentLocalChanges | null) => DocumentLocalChanges | null;

export interface ResourceLocalChanges {
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
    newOperations?: string[];
    deletedOperations?: string[];
}

export interface DocumentLocalChanges {
    resources: Record<string, ResourceLocalChanges>;
}

export interface LocalChangeset {
    date: Date;
    modifiedDocumentResources: Record<string, string[]>;
}

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

export interface LocalEngineListener {
    onLocalChangesUpdated?(engine: LocalEngine): unknown;
}

export default abstract class LocalEngine extends Engine<
    LocalEngineReadOptions,
    LocalEngineWriteOptions,
    LocalEngineDeleteOptions
> {
    public static [CLASS_MARKER] = 'LocalEngine';

    private localEngineListeners = new ListenersManager<LocalEngineListener>();
    private operationDatesCache = new Map<string, Date>();

    public get listeners(): Listeners<LocalEngineListener> {
        return this.localEngineListeners;
    }

    public abstract getContainerUrls(): Promise<string[]>;

    public abstract dropContainers(containerUrls: string[] | RegExp): Promise<void>;

    public abstract getDocumentsLastModifiedAt(): Promise<Record<string, Date | null>>;

    public abstract purgeMetadata(options?: PurgeMetadataOptions): Promise<void>;

    public abstract getDocumentLocalChanges(documentUrl: string): Promise<DocumentLocalChanges | null>;

    public abstract getDocumentsLocalChanges(): Promise<Record<string, DocumentLocalChanges>>;

    public async getLocalChangesets(): Promise<LocalChangeset[]> {
        const changesets = new Map<number, LocalChangeset>();
        const documentsChanges = await this.getDocumentsLocalChanges();
        const addToChangeset = (date: Date, documentUrl: string, resourceUrl: string) => {
            const changeset = changesets.get(date.getTime()) ?? { date, modifiedDocumentResources: {} };
            const resourceUrls = (changeset.modifiedDocumentResources[documentUrl] ??= []);

            resourceUrls.includes(resourceUrl) || resourceUrls.push(resourceUrl);
            changesets.set(date.getTime(), changeset);
        };

        await this.refreshOperationDatesCache(documentsChanges);

        for (const [documentUrl, changes] of Object.entries(documentsChanges)) {
            for (const [resourceUrl, resourceChanges] of Object.entries(changes.resources)) {
                const date = getResourceLocalChangesDate(resourceChanges);

                date && addToChangeset(date, documentUrl, resourceUrl);

                for (const operationUrl of resourceChanges.newOperations ?? []) {
                    const operationDate = this.operationDatesCache.get(operationUrl);

                    operationDate && addToChangeset(operationDate, documentUrl, resourceUrl);
                }
            }
        }

        return Array.from(changesets.values()).sort(
            (changeset, other) => changeset.date.getTime() - other.date.getTime(),
        );
    }

    protected async emitLocalChangesUpdated(): Promise<void> {
        await this.localEngineListeners.emit('onLocalChangesUpdated', this);
    }

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

    private async refreshOperationDatesCache(documentsChanges: Record<string, DocumentLocalChanges>): Promise<void> {
        const operationDates = new Map<string, Date>();

        for (const [documentUrl, changes] of Object.entries(documentsChanges)) {
            const operationUrls = Object.values(changes.resources).flatMap(
                (resourceChanges) => resourceChanges.newOperations ?? [],
            );
            const hasUncachedOperations = operationUrls.some(
                (operationUrl) => !this.operationDatesCache.has(operationUrl),
            );
            const document = hasUncachedOperations
                ? await this.readDocumentIfExists(documentUrl, { includeEmptyDocuments: true })
                : null;

            for (const operationUrl of operationUrls) {
                const date =
                    this.operationDatesCache.get(operationUrl) ?? this.readOperationDate(document, operationUrl);

                date && operationDates.set(operationUrl, date);
            }
        }

        this.operationDatesCache = operationDates;
    }

    private readOperationDate(document: SolidDocument | null, operationUrl: string): Date | undefined {
        const date = document?.statement(operationUrl, CRDT_DATE_PREDICATE)?.object.value;
        const time = date ? new Date(date).getTime() : NaN;

        return Number.isNaN(time) ? undefined : new Date(time);
    }
}

import { RDFLiteral, RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import { arrayFilter, ListenersManager } from '@noeldemartin/utils';
import type { Listeners, Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import { mediaTypeToRDFType } from 'soukai-bis/lib/internals/files';
import {
    CRDT_DATE_PREDICATE,
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS_PREDICATE,
    LDP_RESOURCE_OBJECT,
    PURL_MODIFIED_PREDICATE,
    RDF_TYPE_PREDICATE,
    XSD_DATE_TIME_TYPE,
} from 'soukai-bis/lib/internals/rdf';
import { requireSafeContainerUrl } from 'soukai-bis/lib/internals/urls';

import Engine from './Engine';
import type { FileWriteOptions } from './Engine';
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
    localChanges?: Nullable<LocalChangesUpdate>;
}

export interface LocalEngineDeleteOptions {
    ifMatch?: { status: LocalDocumentStatus };
}

export interface LocalFile {
    url: string;
    containerUrl: string;
    mimeType?: string;
    lastModifiedAt?: Date | null;
    blob?: Blob;
    availableOffline?: boolean;
    deleted?: boolean;
}

export interface LocalFileUpdate {
    blob?: Blob | null;
    mimeType?: string;
    lastModifiedAt?: Date | null;
    availableOffline?: boolean;
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

    public abstract getFile(url: string): Promise<LocalFile | null>;

    public abstract getFiles(options?: { containerUrl?: string }): Promise<LocalFile[]>;

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

    public async writeFile(
        url: string,
        blob: Blob,
        options: FileWriteOptions<LocalEngineWriteOptions> = {},
    ): Promise<null> {
        this.assertFileUrl(url);

        const existingFile = await this.getFile(url);

        await this.putFile(
            {
                url,
                containerUrl: requireSafeContainerUrl(url),
                blob,
                mimeType: options.mimeType ?? (blob.type || existingFile?.mimeType),
                lastModifiedAt:
                    options.lastModifiedAt === undefined ? existingFile?.lastModifiedAt : options.lastModifiedAt,
                availableOffline: existingFile?.availableOffline,
            },
            { localChanges: options.localChanges },
        );

        return null;
    }

    public async createFile(
        url: string,
        blob: Blob,
        options: FileWriteOptions<LocalEngineWriteOptions> = {},
    ): Promise<null> {
        const existingFile = await this.getFile(url);

        if (existingFile && !existingFile.deleted) {
            throw new FileAlreadyExists(url);
        }

        return this.writeFile(url, blob, options);
    }

    public async readFile(url: string): Promise<Blob> {
        const file = await this.getFile(url);

        if (!file?.blob || file.deleted) {
            throw new DocumentNotFound(url);
        }

        return file.blob;
    }

    public async deleteFile(url: string, options: LocalEngineWriteOptions = {}): Promise<null> {
        this.assertFileUrl(url);

        const file = await this.getFile(url);

        if (!file) {
            return null;
        }

        const localChanges =
            options.localChanges &&
            this.applyLocalChangesUpdate(await this.getDocumentLocalChanges(url), options.localChanges);

        if (!localChanges) {
            await this.removeFile(url);

            return null;
        }

        await this.putFile(
            {
                url: file.url,
                containerUrl: file.containerUrl,
                mimeType: file.mimeType,
                lastModifiedAt: file.lastModifiedAt,
                availableOffline: file.availableOffline,
                deleted: true,
            },
            { localChanges: () => localChanges },
        );

        return null;
    }

    public async updateFile(
        url: string,
        update: LocalFileUpdate,
        options: Pick<LocalEngineWriteOptions, 'localChanges'> = {},
    ): Promise<void> {
        this.assertFileUrl(url);

        const file = await this.getFile(url);
        const blob = update.blob === null ? undefined : (update.blob ?? file?.blob);

        await this.putFile(
            {
                url,
                containerUrl: requireSafeContainerUrl(url),
                blob,
                mimeType: update.mimeType ?? file?.mimeType ?? (blob?.type || undefined),
                lastModifiedAt: update.lastModifiedAt === undefined ? file?.lastModifiedAt : update.lastModifiedAt,
                availableOffline: update.availableOffline ?? file?.availableOffline,
                deleted: file?.deleted,
            },
            { localChanges: options.localChanges },
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

    protected containerFilesQuads(containerUrl: string, files: LocalFile[]): Quad[] {
        return files
            .filter((file) => file.containerUrl === containerUrl && !file.deleted)
            .flatMap((file) => {
                const subject = new RDFNamedNode(file.url);
                const mediaType = file.mimeType || 'application/octet-stream';

                return arrayFilter([
                    new RDFQuad(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE, subject),
                    new RDFQuad(subject, RDF_TYPE_PREDICATE, LDP_RESOURCE_OBJECT),
                    new RDFQuad(subject, RDF_TYPE_PREDICATE, new RDFNamedNode(mediaTypeToRDFType(mediaType))),
                    file.lastModifiedAt &&
                        new RDFQuad(
                            subject,
                            PURL_MODIFIED_PREDICATE,
                            new RDFLiteral(file.lastModifiedAt.toISOString(), undefined, XSD_DATE_TIME_TYPE),
                        ),
                ]);
            });
    }

    protected containerMatcher(containerUrls: string[] | RegExp): (url: string) => boolean {
        return Array.isArray(containerUrls)
            ? (url: string) => containerUrls.includes(url)
            : (url: string) => containerUrls.test(url);
    }

    protected abstract putFile(
        file: LocalFile,
        options?: { localChanges?: Nullable<LocalChangesUpdate> },
    ): Promise<void>;

    protected abstract removeFile(url: string): Promise<void>;

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

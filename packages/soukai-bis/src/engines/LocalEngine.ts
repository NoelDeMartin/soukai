import { RDFNamedNode, RDFQuad, SolidDocument } from '@noeldemartin/solid-utils';
import type { Nullable } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import { localFileContainerQuads } from 'soukai-bis/lib/internals/files';
import { LDP_BASIC_CONTAINER_OBJECT, LDP_CONTAINER_OBJECT, RDF_TYPE_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { requireSafeContainerUrl } from 'soukai-bis/lib/internals/urls';

import Engine from './Engine';
import type { FileWriteOptions } from './Engine';
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

export interface LocalFile {
    url: string;
    containerUrl: string;
    mimeType?: string;
    lastModifiedAt?: Date | null;
    blob?: Blob;
    offline?: boolean;
    deleted?: boolean;
}

export interface LocalFileUpdate {
    blob?: Blob | null;
    mimeType?: string;
    lastModifiedAt?: Date | null;
    offline?: boolean;
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

    public abstract getFile(url: string): Promise<LocalFile | null>;

    public abstract getFiles(options?: { containerUrl?: string }): Promise<LocalFile[]>;

    protected abstract putFile(file: LocalFile, options?: { localChanges?: LocalChangesUpdate }): Promise<void>;

    protected abstract removeFile(url: string): Promise<void>;

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
                offline: existingFile?.offline,
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
                offline: file.offline,
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
                offline: update.offline ?? file?.offline,
                deleted: file?.deleted,
            },
            { localChanges: options.localChanges },
        );
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
            .flatMap((file) => localFileContainerQuads(containerUrl, file));
    }

    protected containerMatcher(containerUrls: string[] | RegExp): (url: string) => boolean {
        return Array.isArray(containerUrls)
            ? (url: string) => containerUrls.includes(url)
            : (url: string) => containerUrls.test(url);
    }
}

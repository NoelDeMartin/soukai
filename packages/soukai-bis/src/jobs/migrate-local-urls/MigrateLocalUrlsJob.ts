import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import { isInstanceOf } from '@noeldemartin/utils';
import type { Quad, Term } from '@rdfjs/types';
import { fileLocalChanges, mergeLocalChanges, migrateLocalChanges } from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import type { DocumentLocalChanges, LocalChangesUpdate, LocalFile } from 'soukai-bis/engines/LocalEngine';
import { requireLocalEngine } from 'soukai-bis/engines/state';
import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import Job from 'soukai-bis/jobs/Job';
import {
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS_PREDICATE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/lib/internals/rdf';
import { LOCAL_URL_PROTOCOL } from 'soukai-bis/lib/urls';
import { isCoreModel } from 'soukai-bis/models/core';
import { getBootedModels } from 'soukai-bis/models/registry';

export interface MigrateLocalUrlsJobConfig {
    migrations?: Record<string, string>;
    prefixes?: Record<string, string>;
}

export default class MigrateLocalUrlsJob extends Job {
    public static async run(config: MigrateLocalUrlsJobConfig): Promise<void> {
        const job = new MigrateLocalUrlsJob(config);

        await job.process();
    }

    declare private engine: LocalEngine;
    declare private migratedAt: Date;

    public constructor(private config: MigrateLocalUrlsJobConfig) {
        super();
    }

    protected async run(): Promise<void> {
        this.engine = requireLocalEngine();
        this.migratedAt = new Date();

        const hasMigrations = this.hasMigrations();
        const hasPrefixes = this.hasPrefixes();

        if (!hasMigrations && !hasPrefixes) {
            return;
        }

        const localContainerUrls = (await this.engine.getContainerUrls())
            .filter((localContainerUrl) => hasPrefixes || !!this.migrateUrl(localContainerUrl))
            .sort((a, b) => a.length - b.length);

        for (const localContainerUrl of localContainerUrls) {
            await this.migrateContainer(localContainerUrl);
        }

        for (const localContainerUrl of localContainerUrls) {
            const container = await this.engine.readDocument(localContainerUrl);
            const files = await this.engine.getLocalFiles({ containerUrl: localContainerUrl });
            const fileUrls = new Set(files.map((file) => file.url));
            const documentUrls = container
                .statements(new RDFNamedNode(localContainerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value)
                .filter((documentUrl) => !documentUrl.endsWith('/') && !fileUrls.has(documentUrl));

            for (const documentUrl of documentUrls) {
                await this.migrateDocument(documentUrl);
            }

            for (const file of files) {
                await this.migrateFile(file);
            }
        }

        if (hasMigrations) {
            await this.engine.dropContainers(new RegExp(`^${LOCAL_URL_PROTOCOL}//`));
        }
    }

    protected async migrateContainer(containerUrl: string): Promise<void> {
        const remoteUrl = this.migrateUrl(containerUrl);

        if (!remoteUrl) {
            return;
        }

        const container = await this.engine.readDocument(containerUrl);
        const localChanges = await this.engine.getDocumentLocalChanges(containerUrl);
        const fileUrls = new Set((await this.engine.getLocalFiles({ containerUrl })).map((file) => file.url));
        const containerQuads = container.getQuads().filter((quad) => !fileUrls.has(quad.subject.value));
        const metaQuads = containerQuads.filter(
            (quad) =>
                !quad.predicate.equals(LDP_CONTAINS_PREDICATE) &&
                !(
                    quad.predicate.equals(RDF_TYPE_PREDICATE) &&
                    (quad.object.equals(LDP_CONTAINER_OBJECT) || quad.object.equals(LDP_BASIC_CONTAINER_OBJECT))
                ),
        );

        if (metaQuads.length === 0 && !localChanges) {
            return;
        }

        const migratedQuads = this.migrateQuads(containerQuads);
        const migratedLocalChanges = this.migrateDocumentLocalChanges(localChanges, migratedQuads);

        try {
            await this.engine.createDocument(remoteUrl, migratedQuads, {
                localChanges: migratedLocalChanges,
            });
        } catch (error) {
            if (!isInstanceOf(error, DocumentAlreadyExists)) {
                throw error;
            }

            if (migratedLocalChanges) {
                await this.engine.updateDocument(remoteUrl, [], { localChanges: migratedLocalChanges });
            }
        }
    }

    protected async migrateDocument(documentUrl: string): Promise<void> {
        const remoteUrl = this.migrateUrl(documentUrl);

        if (!remoteUrl && !this.hasPrefixes()) {
            return;
        }

        const document = await this.engine.readDocument(documentUrl);
        const quads = document.getQuads();
        const migratedQuads = this.migrateQuads(quads);

        if (remoteUrl) {
            const localChanges = await this.engine.getDocumentLocalChanges(documentUrl);

            await this.engine.createDocument(remoteUrl, migratedQuads, {
                localChanges: this.migrateDocumentLocalChanges(localChanges, migratedQuads),
            });
            await this.engine.deleteDocument(documentUrl);

            return;
        }

        if (migratedQuads.every((quad, index) => quad === quads[index])) {
            return;
        }

        await this.engine.updateDocument(documentUrl, [
            {
                applyToQuads: () => migratedQuads,
                applyToSparql: () => {
                    throw new Error('MigrateLocalUrlsJob in-place prefix rewrite is only supported on local engines');
                },
            },
        ]);
    }

    protected async migrateFile(file: LocalFile): Promise<void> {
        const remoteUrl = this.migrateUrl(file.url);

        if (!remoteUrl) {
            return;
        }

        if (!file.deleted) {
            const localChanges = await this.engine.getDocumentLocalChanges(file.url);
            const blob = await this.engine.readFileIfExists(file.url);

            await this.engine.updateFile(
                remoteUrl,
                {
                    blob,
                    mimeType: file.mimeType,
                    lastModifiedAt: file.lastModifiedAt,
                    availableOffline: file.availableOffline,
                },
                {
                    localChanges: localChanges
                        ? this.migrateLocalChanges(localChanges)
                        : fileLocalChanges(remoteUrl, 'created', this.migratedAt),
                },
            );
        }

        await this.engine.deleteFile(file.url);
    }

    protected migrateQuads(quads: Quad[]): Quad[] {
        return quads.map((quad) => {
            const migratedSubject = this.migrateTerm(quad.subject);
            const migratedPredicate = this.migratePrefixTerm(quad.predicate);
            const migratedObject = this.migrateTerm(quad.object);

            if (!migratedSubject && !migratedPredicate && !migratedObject) {
                return quad;
            }

            return new RDFQuad(
                migratedSubject ?? quad.subject,
                migratedPredicate ?? quad.predicate,
                migratedObject ?? quad.object,
            );
        });
    }

    protected hasMigrations(): boolean {
        return Object.keys(this.config.migrations ?? {}).length > 0;
    }

    protected hasPrefixes(): boolean {
        return Object.keys(this.config.prefixes ?? {}).length > 0;
    }

    protected migrateDocumentLocalChanges(
        localChanges: DocumentLocalChanges | null,
        migratedQuads: Quad[],
    ): LocalChangesUpdate | undefined {
        if (localChanges) {
            return this.migrateLocalChanges(localChanges);
        }

        const createdResourceUrls = this.getModelResourceUrls(migratedQuads);

        if (createdResourceUrls.length === 0) {
            return undefined;
        }

        return (changes) =>
            mergeLocalChanges(changes, {
                resources: Object.fromEntries(createdResourceUrls.map((url) => [url, { createdAt: this.migratedAt }])),
            });
    }

    protected migrateLocalChanges(localChanges: DocumentLocalChanges): LocalChangesUpdate {
        const migratedLocalChanges = migrateLocalChanges(localChanges, (url) => this.migrateUrl(url));

        return (changes) => mergeLocalChanges(changes, migratedLocalChanges);
    }

    protected getModelResourceUrls(quads: Quad[]): string[] {
        const resourceTypes = new Map<string, Set<string>>();
        const models = Array.from(getBootedModels().values()).filter((model) => !isCoreModel(model));

        for (const quad of quads) {
            if (!quad.predicate.equals(RDF_TYPE_PREDICATE)) {
                continue;
            }

            const types = resourceTypes.get(quad.subject.value) ?? new Set<string>();

            types.add(quad.object.value);
            resourceTypes.set(quad.subject.value, types);
        }

        return Array.from(resourceTypes.entries())
            .filter(([_, types]) => models.some((model) => model.matchesRDFClasses(types)))
            .map(([resourceUrl]) => resourceUrl);
    }

    protected migrateUrl(url: string): string | null {
        for (const [original, migrated] of Object.entries(this.config.migrations ?? {})) {
            if (!url.startsWith(original)) {
                continue;
            }

            return url.replace(original, migrated);
        }

        return null;
    }

    protected migratePrefix(url: string): string | null {
        for (const [original, migrated] of Object.entries(this.config.prefixes ?? {})) {
            if (!url.startsWith(original)) {
                continue;
            }

            return url.replace(original, migrated);
        }

        return null;
    }

    protected migratePrefixTerm<T extends Term>(term: T): T | null {
        if (term.termType !== 'NamedNode') {
            return null;
        }

        const migratedUrl = this.migratePrefix(term.value);

        if (!migratedUrl) {
            return null;
        }

        return new RDFNamedNode(migratedUrl) as T;
    }

    protected migrateTerm<T extends Term>(term: T): T | null {
        if (term.termType !== 'NamedNode') {
            return null;
        }

        const migratedUrl = this.migrateUrl(term.value) ?? this.migratePrefix(term.value);

        if (!migratedUrl) {
            return null;
        }

        return new RDFNamedNode(migratedUrl) as T;
    }
}

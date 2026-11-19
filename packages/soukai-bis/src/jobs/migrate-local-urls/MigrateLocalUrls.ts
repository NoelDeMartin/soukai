import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import { isInstanceOf } from '@noeldemartin/utils';
import type { Quad, Term } from '@rdfjs/types';
import { mergeLocalChanges, migrateLocalChanges } from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import type { DocumentLocalChanges, LocalChangesUpdate } from 'soukai-bis/engines/LocalEngine';
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

export interface MigrateLocalUrlsConfig {
    migrations?: Record<string, string>;
    prefixes?: Record<string, string>;
}

export default class MigrateLocalUrls extends Job {
    public static async run(config: MigrateLocalUrlsConfig): Promise<void> {
        const job = new MigrateLocalUrls(config);

        await job.process();
    }

    declare private engine: LocalEngine;

    public constructor(private config: MigrateLocalUrlsConfig) {
        super();
    }

    protected async run(): Promise<void> {
        this.engine = requireLocalEngine();

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
            const documentUrls = container
                .statements(new RDFNamedNode(localContainerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value)
                .filter((documentUrl) => !documentUrl.endsWith('/'));

            for (const documentUrl of documentUrls) {
                await this.migrateDocument(documentUrl);
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
        const metaQuads = container
            .getQuads()
            .filter(
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

        const migratedLocalChanges = this.migrateLocalChanges(localChanges);

        try {
            await this.engine.createDocument(remoteUrl, this.migrateQuads(container.getQuads()), {
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
                localChanges: this.migrateLocalChanges(localChanges),
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
                    throw new Error('MigrateLocalUrls in-place prefix rewrite is only supported on local engines');
                },
            },
        ]);
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

    protected migrateLocalChanges(localChanges: DocumentLocalChanges | null): LocalChangesUpdate | undefined {
        if (!localChanges) {
            return undefined;
        }

        const migratedLocalChanges = migrateLocalChanges(localChanges, (url) => this.migrateUrl(url));

        return (changes) => mergeLocalChanges(changes, migratedLocalChanges);
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

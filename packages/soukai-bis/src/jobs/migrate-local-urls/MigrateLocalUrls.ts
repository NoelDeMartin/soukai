import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Term } from '@rdfjs/types';
import type ManagesContainers from 'soukai-bis/engines/contracts/ManagesContainers';
import type Engine from 'soukai-bis/engines/Engine';
import Job from 'soukai-bis/jobs/Job';
import { LDP_CONTAINS_PREDICATE } from 'soukai-bis/lib/internals/rdf';
import { LOCAL_URL_PROTOCOL } from 'soukai-bis/lib/urls';

export interface MigrateLocalUrlsConfig {
    engine: Engine & ManagesContainers;
    migrations?: Record<string, string>;
    prefixes?: Record<string, string>;
}

export default class MigrateLocalUrls extends Job {
    public static async run(config: MigrateLocalUrlsConfig): Promise<void> {
        const job = new MigrateLocalUrls(config);

        await job.process();
    }

    public constructor(private config: MigrateLocalUrlsConfig) {
        super();
    }

    protected async run(): Promise<void> {
        const hasMigrations = this.hasMigrations();
        const hasPrefixes = this.hasPrefixes();

        if (!hasMigrations && !hasPrefixes) {
            return;
        }

        const localContainerUrls = await this.config.engine.getContainerUrls();

        for (const localContainerUrl of localContainerUrls) {
            if (!hasPrefixes && !this.migrateUrl(localContainerUrl)) {
                continue;
            }

            const container = await this.config.engine.readDocument(localContainerUrl);
            const documentUrls = container
                .statements(new RDFNamedNode(localContainerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value)
                .filter((documentUrl) => !documentUrl.endsWith('/'));

            for (const documentUrl of documentUrls) {
                await this.migrateDocument(documentUrl);
            }

            // TODO migrate containers metadata
        }

        if (hasMigrations) {
            await this.config.engine.dropContainers(new RegExp(`^${LOCAL_URL_PROTOCOL}//`));
        }
    }

    protected async migrateDocument(documentUrl: string): Promise<void> {
        const remoteUrl = this.migrateUrl(documentUrl);

        if (!remoteUrl && !this.hasPrefixes()) {
            return;
        }

        let changed = false;
        const document = await this.config.engine.readDocument(documentUrl);
        const migratedQuads = document.getQuads().map((quad) => {
            const migratedSubject = this.migrateTerm(quad.subject);
            const migratedPredicate = this.migratePrefixTerm(quad.predicate);
            const migratedObject = this.migrateTerm(quad.object);

            if (!migratedSubject && !migratedPredicate && !migratedObject) {
                return quad;
            }

            changed = true;

            return new RDFQuad(
                migratedSubject ?? quad.subject,
                migratedPredicate ?? quad.predicate,
                migratedObject ?? quad.object,
            );
        });

        if (remoteUrl) {
            await this.config.engine.createDocument(remoteUrl, migratedQuads);
            await this.config.engine.deleteDocument(documentUrl);

            return;
        }

        if (changed) {
            await this.config.engine.updateDocument(documentUrl, [
                {
                    applyToQuads: () => migratedQuads,
                    applyToSparql: () => {
                        throw new Error('MigrateLocalUrls in-place prefix rewrite is only supported on local engines');
                    },
                },
            ]);
        }
    }

    protected hasMigrations(): boolean {
        return Object.keys(this.config.migrations ?? {}).length > 0;
    }

    protected hasPrefixes(): boolean {
        return Object.keys(this.config.prefixes ?? {}).length > 0;
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

import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Term } from '@rdfjs/types';

import Job from 'soukai-bis/jobs/Job';
import type Engine from 'soukai-bis/engines/Engine';
import type ManagesContainers from 'soukai-bis/engines/contracts/ManagesContainers';
import { LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

export interface MigrateUrlsConfig {
    engine: Engine & ManagesContainers;
    migrations: Record<string, string>;
}

export default class MigrateUrls extends Job {

    public static async run(config: MigrateUrlsConfig): Promise<void> {
        const job = new MigrateUrls(config);

        await job.run();
    }

    public constructor(private config: MigrateUrlsConfig) {
        super();
    }

    protected async run(): Promise<void> {
        const localContainerUrls = await this.config.engine.getContainerUrls();
        const migratedContainerUrls: string[] = [];

        for (const localContainerUrl of localContainerUrls) {
            if (!this.migrateUrl(localContainerUrl)) {
                continue;
            }

            const container = await this.config.engine.readDocument(localContainerUrl);
            const documentUrls = container
                .statements(new RDFNamedNode(localContainerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value);

            for (const documentUrl of documentUrls) {
                await this.migrateDocument(documentUrl);
            }

            migratedContainerUrls.push(localContainerUrl);
        }

        await this.config.engine.dropContainers(migratedContainerUrls);
    }

    protected async migrateDocument(documentUrl: string): Promise<void> {
        const remoteUrl = this.migrateUrl(documentUrl);

        if (!remoteUrl) {
            return;
        }

        const document = await this.config.engine.readDocument(documentUrl);
        const migratedQuads = document.getQuads().map((quad) => {
            const migratedSubject = this.migrateTerm(quad.subject);
            const migratedObject = this.migrateTerm(quad.object);

            if (!migratedSubject && !migratedObject) {
                return quad;
            }

            return new RDFQuad(migratedSubject ?? quad.subject, quad.predicate, migratedObject ?? quad.object);
        });

        await this.config.engine.createDocument(remoteUrl, migratedQuads);
        await this.config.engine.deleteDocument(documentUrl);
    }

    protected migrateUrl(url: string): string | null {
        for (const [original, migrated] of Object.entries(this.config.migrations)) {
            if (!url.startsWith(original)) {
                continue;
            }

            return url.replace(original, migrated);
        }

        return null;
    }

    protected migrateTerm<T extends Term>(term: T): T | null {
        if (term.termType !== 'NamedNode') {
            return null;
        }

        const migratedUrl = this.migrateUrl(term.value);

        if (!migratedUrl) {
            return null;
        }

        return new RDFNamedNode(migratedUrl) as T;
    }

}

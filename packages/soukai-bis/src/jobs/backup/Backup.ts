import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import type { Term } from '@rdfjs/types';

import Job from 'soukai-bis/jobs/Job';
import type Engine from 'soukai-bis/engines/Engine';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import type ManagesContainers from 'soukai-bis/engines/contracts/ManagesContainers';
import { LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';

export interface BackupConfig {
    urlMigrations: Record<string, string>;
    localEngine: Engine & ManagesContainers;
    remoteEngine: SolidEngine;
}

export default class Backup extends Job {

    public static async run(config: BackupConfig): Promise<void> {
        const job = new Backup(config);

        await job.run();
    }

    public constructor(private config: BackupConfig) {
        super();
    }

    protected async run(): Promise<void> {
        const localContainerUrls = await this.config.localEngine.getContainerUrls();
        const migratedContainerUrls: string[] = [];

        for (const localContainerUrl of localContainerUrls) {
            if (!this.migrateUrl(localContainerUrl)) {
                continue;
            }

            const container = await this.config.localEngine.readDocument(localContainerUrl);
            const documentUrls = container
                .statements(new RDFNamedNode(localContainerUrl), LDP_CONTAINS_PREDICATE)
                .map((quad) => quad.object.value);

            for (const documentUrl of documentUrls) {
                await this.migrateDocument(documentUrl);
            }

            migratedContainerUrls.push(localContainerUrl);
        }

        await this.config.localEngine.dropContainers(migratedContainerUrls);
    }

    protected async migrateDocument(documentUrl: string): Promise<void> {
        const remoteUrl = this.migrateUrl(documentUrl);

        if (!remoteUrl) {
            return;
        }

        const document = await this.config.localEngine.readDocument(documentUrl);
        const migratedQuads = document.getQuads().map((quad) => {
            const migratedSubject = this.migrateTerm(quad.subject);
            const migratedObject = this.migrateTerm(quad.object);

            if (!migratedSubject && !migratedObject) {
                return quad;
            }

            return new RDFQuad(migratedSubject ?? quad.subject, quad.predicate, migratedObject ?? quad.object);
        });

        await this.config.remoteEngine.createDocument(remoteUrl, migratedQuads);
        await this.config.localEngine.deleteDocument(documentUrl);
    }

    protected migrateUrl(url: string): string | null {
        for (const [original, migrated] of Object.entries(this.config.urlMigrations)) {
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

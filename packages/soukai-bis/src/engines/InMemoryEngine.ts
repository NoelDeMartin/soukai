import { fail } from '@noeldemartin/utils';
import { jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import type Operation from 'soukai-bis/models/crdts/Operation';

import type Engine from './Engine';

export default class InMemoryEngine implements Engine {

    public documents: Record<string, JsonLD> = {};

    public async createDocument(url: string, graph: JsonLD): Promise<void> {
        if (url in this.documents) {
            throw new DocumentAlreadyExists(url);
        }

        this.documents[url] = graph;
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        const document = this.documents[url];

        if (!document) {
            throw new DocumentNotFound(url);
        }

        let quads = await jsonldToQuads(document);

        for (const operation of operations) {
            quads = operation.applyToQuads(quads);
        }

        this.documents[url] = await quadsToJsonLD(quads);
    }

    public async readOneDocument(url: string): Promise<JsonLD> {
        return this.documents[url] ?? fail(DocumentNotFound, url);
    }

    public async readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>> {
        const documents: Record<string, JsonLD> = {};

        for (const [url, graph] of Object.entries(this.documents)) {
            if (!url.startsWith(containerUrl)) {
                continue;
            }

            documents[url] = graph;
        }

        return documents;
    }

    public async deleteDocument(url: string): Promise<void> {
        delete this.documents[url];
    }

}

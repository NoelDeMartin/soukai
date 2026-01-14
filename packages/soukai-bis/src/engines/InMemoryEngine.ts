import type { JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import type Engine from './Engine';

export default class InMemoryEngine implements Engine {

    public documents: Record<string, JsonLD> = {};

    public async createDocument(url: string, graph: JsonLD): Promise<void> {
        if (url in this.documents) {
            throw new DocumentAlreadyExists(url);
        }

        this.documents[url] = graph;
    }

    public async updateDocument(url: string, graph: JsonLD): Promise<void> {
        this.documents[url] = graph;
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

}

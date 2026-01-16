import { SolidClient, SparqlUpdate, jsonldToQuads, quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { Fetch, JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS, RDF_TYPE } from 'soukai-bis/models/constants';
import type Operation from 'soukai-bis/models/crdts/Operation';

import type Engine from './Engine';

export default class SolidEngine implements Engine {

    private client: SolidClient;

    public constructor(fetch?: Fetch) {
        this.client = new SolidClient({ fetch });
    }

    public async createDocument(url: string, graph: JsonLD): Promise<void> {
        if (await this.client.exists(url)) {
            throw new DocumentAlreadyExists(url);
        }

        const quads = await jsonldToQuads(graph);
        const body = quadsToTurtle(quads);

        await this.client.create(url, body);
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        const document = await this.client.read(url);
        const sparql = new SparqlUpdate(document);

        for (const operation of operations) {
            operation.applyToSparql(sparql);
        }

        await this.client.update(url, sparql);
    }

    public async readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>> {
        const container = await this.client.read(containerUrl);
        const containsQuads = container.statements(containerUrl, LDP_CONTAINS);
        const documents: Record<string, JsonLD> = {};

        await Promise.all(
            containsQuads.map(async (quad) => {
                const url = quad.object.value;
                const document = await this.client.readIfFound(url);

                if (
                    !document ||
                    document.contains(url, RDF_TYPE, LDP_CONTAINER) ||
                    document.contains(url, RDF_TYPE, LDP_BASIC_CONTAINER)
                ) {
                    return;
                }

                documents[url] = await quadsToJsonLD(document.getQuads());
            }),
        );

        return documents;
    }

}

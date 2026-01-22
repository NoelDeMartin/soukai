import {
    RDFNamedNode,
    SolidClient,
    SparqlUpdate,
    jsonldToQuads,
    quadsToJsonLD,
    quadsToTurtle,
} from '@noeldemartin/solid-utils';
import type { Fetch, JsonLD } from '@noeldemartin/solid-utils';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import {
    LDP_BASIC_CONTAINER_OBJECT,
    LDP_CONTAINER_OBJECT,
    LDP_CONTAINS_PREDICATE,
    RDF_TYPE_PREDICATE,
} from 'soukai-bis/utils/rdf';
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

        const allQuads = await jsonldToQuads(graph);
        const filteredQuads = url.endsWith('/')
            ? allQuads.filter(
                (quad) => !quad.predicate.equals(LDP_CONTAINS_PREDICATE) && !quad.object.equals(LDP_CONTAINER_OBJECT),
            )
            : allQuads;
        const body = quadsToTurtle(filteredQuads);

        await this.client.create(url, body, { method: url.endsWith('/') ? 'PUT' : 'PATCH' });
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        operations = url.endsWith('/')
            ? operations.filter(
                (operation) =>
                    !(operation instanceof PropertyOperation) || !operation.hasPredicate(LDP_CONTAINS_PREDICATE),
            )
            : operations;

        if (operations.length === 0) {
            return;
        }

        const document = await this.client.readIfFound(url);

        if (!document) {
            throw new DocumentNotFound(url);
        }

        const sparql = new SparqlUpdate(document);

        for (const operation of operations) {
            operation.applyToSparql(sparql);
        }

        await this.client.update(url, sparql);
    }

    public async readOneDocument(url: string): Promise<JsonLD> {
        const document = await this.client.readIfFound(url);

        if (!document) {
            throw new DocumentNotFound(url);
        }

        return quadsToJsonLD(document.getQuads());
    }

    public async readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>> {
        const container = await this.client.read(containerUrl);
        const containsQuads = container.statements(new RDFNamedNode(containerUrl), LDP_CONTAINS_PREDICATE);
        const documents: Record<string, JsonLD> = {};

        await Promise.all(
            containsQuads.map(async (quad) => {
                const url = quad.object.value;
                const subject = quad.object.termType === 'Literal' ? quad.object.value : quad.object;
                const document = await this.client.readIfFound(url);

                if (
                    !document ||
                    document.contains(subject, RDF_TYPE_PREDICATE, LDP_CONTAINER_OBJECT) ||
                    document.contains(subject, RDF_TYPE_PREDICATE, LDP_BASIC_CONTAINER_OBJECT)
                ) {
                    return;
                }

                documents[url] = await quadsToJsonLD(document.getQuads());
            }),
        );

        return documents;
    }

    public async deleteDocument(url: string): Promise<void> {
        await this.client.delete(url);
    }

}

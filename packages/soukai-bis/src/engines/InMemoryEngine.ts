import { fail, urlParentDirectory } from '@noeldemartin/utils';
import { RDFNamedNode, RDFQuad, SolidDocument, jsonldToQuads, quadsToJsonLD } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';
import type { Quad } from '@rdfjs/types';

import DocumentAlreadyExists from 'soukai-bis/errors/DocumentAlreadyExists';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';
import { safeContainerUrl } from 'soukai-bis/utils/urls';
import { LDP_BASIC_CONTAINER, LDP_CONTAINER, LDP_CONTAINS_PREDICATE } from 'soukai-bis/utils/rdf';
import type Operation from 'soukai-bis/models/crdts/Operation';

import Engine from './Engine';

export default class InMemoryEngine extends Engine {

    public documents: Record<string, JsonLD> = {};

    public async createDocument(url: string, contents: JsonLD | Quad[]): Promise<void> {
        if (url in this.documents) {
            throw new DocumentAlreadyExists(url);
        }

        const graph = Array.isArray(contents) ? await quadsToJsonLD(contents) : contents;

        if (url.endsWith('/')) {
            this.removeContainerProperties(graph, { keepTypes: true });
        }

        this.documents[url] = graph;

        let containerUrl: string | null = url;

        while ((containerUrl = safeContainerUrl(containerUrl)) !== null) {
            this.documents[containerUrl] ??= {
                '@id': containerUrl,
                '@type': [LDP_CONTAINER, LDP_BASIC_CONTAINER],
            };
        }
    }

    public async readDocument(url: string): Promise<SolidDocument> {
        const jsonld = this.documents[url] ?? fail<JsonLD>(DocumentNotFound, url);
        const document = new SolidDocument(url, await jsonldToQuads(jsonld));

        if (url.endsWith('/')) {
            this.populateContainer(document);
        }

        return document;
    }

    public async updateDocument(url: string, operations: Operation[]): Promise<void> {
        operations = url.endsWith('/') ? this.filterContainerOperations(operations) : operations;

        if (operations.length === 0) {
            return;
        }

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

    public async deleteDocument(url: string): Promise<void> {
        delete this.documents[url];
    }

    private async populateContainer(document: SolidDocument): Promise<void> {
        const quads: Quad[] = [];
        const subject = new RDFNamedNode(document.url);

        for (const url of Object.keys(this.documents)) {
            const parentUrl = urlParentDirectory(url);

            if (!parentUrl || parentUrl !== document.url) {
                continue;
            }

            quads.push(new RDFQuad(subject, LDP_CONTAINS_PREDICATE, new RDFNamedNode(url)));
        }

        document.addQuads(quads);
    }

}

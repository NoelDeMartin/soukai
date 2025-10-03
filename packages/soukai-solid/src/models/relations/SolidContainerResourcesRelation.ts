import type { EngineDocument } from 'soukai';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';

import RDFDocument from 'soukai-solid/solid/RDFDocument';
import SolidBelongsToManyRelation from 'soukai-solid/models/relations/SolidBelongsToManyRelation';
import SolidResource from 'soukai-solid/models/SolidResource';
import type SolidContainer from 'soukai-solid/models/SolidContainer';

interface GraphDocument {
    'purl:modified'?: { '@value': string };
    'http://purl.org/dc/terms/modified'?: { '@value': string };
    'purl:created'?: { '@value': string };
    'http://purl.org/dc/terms/created'?: { '@value': string };
}

export default class SolidContainerResourcesRelation extends SolidBelongsToManyRelation<
    SolidContainer,
    SolidResource,
    typeof SolidResource
> {

    constructor(container: SolidContainer) {
        super(container, SolidResource, 'resourceUrls');
    }

    public get container(): SolidContainer {
        return this.parent;
    }

    public async load(): Promise<SolidResource[]> {
        if (this.isEmpty()) {
            return (this.related = []);
        }

        if (this.parent.usingSolidEngine()) {
            return super.load();
        }

        // TODO this implementation can have serious performance issues for some engines.
        // Right now, there are only local engines other than Solid being used with Soukai,
        // so the problem is not as severe.
        const engine = this.parent.requireEngine();
        const documents = await engine.readMany(this.container.requireDocumentUrl());

        this.related = Object.entries(documents).map(
            ([url, document]) =>
                new SolidResource({
                    url,
                    updatedAt: this.getLatestUpdateDate(document['@graph'] as GraphDocument[]),
                }),
        );

        return this.related;
    }

    public async __loadDocumentModels(documentUrl: string, document: JsonLDGraph): Promise<void> {
        if (!SolidResource.usingSolidEngine()) {
            return super.__loadDocumentModels(documentUrl, document);
        }

        const resourceUrls = this.parent.resourceUrls;
        const reducedDocument = RDFDocument.reduceJsonLDGraph(document, this.parent.url) as EngineDocument;
        const documentIds = document['@graph']
            .filter((resource) => resourceUrls.indexOf(resource['@id']) !== -1)
            .map((resource) => resource['@id']);

        const modelsInSameDocument = await Promise.all(
            documentIds.map((id) => SolidResource.createFromEngineDocument(documentUrl, reducedDocument, id)),
        );

        this.protectedSolidBelongsTo.loadDocumentModels(modelsInSameDocument, []);
    }

    private getLatestUpdateDate(documents: GraphDocument[]): Date {
        const latestUpdateTime = documents.reduce((latestUpdatedAt, document) => {
            const { '@value': dateValue } = document['purl:modified'] ??
                document['http://purl.org/dc/terms/modified'] ??
                document['purl:created'] ??
                document['http://purl.org/dc/terms/created'] ?? { '@value': 0 };

            const documentUpdatedAt = new Date(dateValue).getTime();

            return Math.max(latestUpdatedAt, documentUpdatedAt);
        }, 0);

        return new Date(latestUpdateTime);
    }

}

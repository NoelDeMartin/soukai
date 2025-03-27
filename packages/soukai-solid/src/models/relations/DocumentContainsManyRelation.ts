import { arrayFilter, tap } from '@noeldemartin/utils';
import { MultiModelRelation } from 'soukai';
import type { Attributes, EngineDocument } from 'soukai';

import RDFDocument from 'soukai-solid/solid/RDFDocument';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';
import type { JsonLDGraph } from '@noeldemartin/solid-utils';
import type { DocumentContainsRelation } from 'soukai-solid/models/relations/DocumentContainsRelation';

export default class DocumentContainsManyRelation<
        Parent extends SolidModel = SolidModel,
        Related extends SolidModel = SolidModel,
        RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
    >
    extends MultiModelRelation<Parent, Related, RelatedClass>
    implements DocumentContainsRelation
{

    constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass);
    }

    public setForeignAttributes(): void {
        // nothing to do here, these models don't have any attributes pointing to each other.
    }

    public async load(): Promise<Related[]> {
        this.related ??= [];

        return this.related;
    }

    public create(attributes?: Attributes): Promise<Related> {
        return tap(this.attach(attributes ?? {}), () => this.parent.save());
    }

    public async __loadDocumentModels(documentUrl: string, document: JsonLDGraph): Promise<void> {
        const rdfDocument = await RDFDocument.fromJsonLD(document);
        const reducedDocument = RDFDocument.reduceJsonLDGraph(document, this.parent.url);

        this.related = arrayFilter(
            await Promise.all(
                this.relatedClass.findMatchingResourceIds(rdfDocument.statements).map((resourceId) => {
                    const resource = reducedDocument['@graph'].find((_resource) => _resource['@id'] === resourceId);

                    return (
                        resource &&
                        this.relatedClass.createFromEngineDocument(
                            documentUrl,
                            reducedDocument as EngineDocument,
                            resource['@id'],
                        )
                    );
                }),
            ),
        );
    }

}

import SolidContainer from 'soukai-bis/models/SolidContainer';
import { requireEngine } from 'soukai-bis/engines';
import { isInstanceOf } from '@noeldemartin/utils';
import { DocumentNotFound, SoukaiError } from 'soukai-bis/errors';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import MultiModelRelation from './MultiModelRelation';
import { classMarker } from './helpers';

export default class ContainsRelation<
    Parent extends SolidContainer = SolidContainer,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public static [classMarker] = ['ContainsRelation', ...MultiModelRelation[classMarker]];

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, { foreignKeyName: '__unused__' });

        if (!isInstanceOf(parent, SolidContainer)) {
            throw new SoukaiError(
                `non-container model initialized for ContainsRelation: ${(parent as Model).static().modelName}`,
            );
        }
    }

    public setForeignAttributes(): void {
        // Nothing to do here, these models don't have any attributes pointing to each other.
    }

    public async load(): Promise<Related[]> {
        this.related = await this.loadContainedModels();

        return this.related;
    }

    private async loadContainedModels(): Promise<Related[]> {
        const documentUrls = this.parent.resourceUrls;

        if (documentUrls.length === 0) {
            return [];
        }

        const engine = requireEngine();
        const models = await Promise.all(
            documentUrls.map(async (documentUrl) => {
                try {
                    const document = await engine.readOneDocument(documentUrl);

                    return this.relatedClass.createManyFromJsonLD(document);
                } catch (error) {
                    if (!isInstanceOf(error, DocumentNotFound)) {
                        throw error;
                    }

                    return [];
                }
            }),
        );

        return models.flat();
    }

}

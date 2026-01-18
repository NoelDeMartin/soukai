import { requireUrlParentDirectory } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { isSolidContainerClass } from 'soukai-bis/models/utils-containers';
import type Model from 'soukai-bis/models/Model';
import type SolidContainer from 'soukai-bis/models/SolidContainer';
import type { ModelConstructor } from 'soukai-bis/models/types';

import Relation from './Relation';

export default class IsContainedByRelation<
    Parent extends Model = Model,
    Related extends SolidContainer = SolidContainer,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends Relation<Parent, Related, RelatedClass> {

    public static validateRelatedClass(parent: Model, relatedClass: unknown): void {
        if (isSolidContainerClass(relatedClass)) {
            return;
        }

        throw new SoukaiError(
            `Relation for model ${parent.static().modelName} is not defined correctly, ` +
                'related value is not a solid container class.',
        );
    }

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, { foreignKeyName: '__unused__' });
    }

    public async load(): Promise<Related | null> {
        if (!this.parent.url) {
            return null;
        }

        const containerUrl = requireUrlParentDirectory(this.parent.url);

        this.related = await this.relatedClass.find(containerUrl);

        return this.related;
    }

}

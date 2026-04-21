import { objectOnly, requireUrlParentDirectory } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { isContainerClass } from 'soukai-bis/models/ldp/utils';
import type Model from 'soukai-bis/models/Model';
import type Container from 'soukai-bis/models/ldp/Container';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import SingleModelRelation from './SingleModelRelation';
import type { GetRelatedModelInput } from './types';

export default class IsContainedByRelation<
    Parent extends Model = Model,
    Related extends Container = Container,
    RelatedClass extends ModelConstructor<Related> & typeof Container = ModelConstructor<Related> & typeof Container,
> extends SingleModelRelation<Parent, Related, RelatedClass, 'resourceUrls'> {

    public static validateRelatedClass(parentClass: ModelConstructor, relatedClass: unknown): void {
        if (isContainerClass(relatedClass)) {
            return;
        }

        throw new SoukaiError(
            `Relation for model ${parentClass.modelName} is not defined correctly, ` +
                'related value is not a solid container class.',
        );
    }

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, { foreignKeyName: 'resourceUrls' });
    }

    public async load(): Promise<Related | null> {
        if (!this.parent.url) {
            return null;
        }

        const containerUrl = requireUrlParentDirectory(this.parent.url);

        this.related = await this.relatedClass.find(containerUrl);

        return this.related;
    }

    public async loadFromDocumentRDF(): Promise<void> {
        // Nothing to do here
    }

    public isEmpty(): false {
        return false;
    }

    public addForeignAttributes<T extends GetRelatedModelInput<RelatedClass, 'resourceUrls'>>(attributes: T): T {
        const relatedAttributes = attributes as GetModelInput<RelatedClass>;
        const parentDocumentUrl = this.parent.getDocumentUrl();

        if (!parentDocumentUrl || !this.parent.url || relatedAttributes.resourceUrls?.includes(parentDocumentUrl)) {
            return attributes;
        }

        relatedAttributes.resourceUrls = (relatedAttributes.resourceUrls ?? []).concat([parentDocumentUrl]);

        return attributes;
    }

    public setForeignAttributes(related: Related): void {
        const attributes = objectOnly(related.getAttributes(), ['resourceUrls']) as GetModelInput<RelatedClass>;

        this.addForeignAttributes(attributes);

        related.setAttribute('resourceUrls', attributes['resourceUrls']);
    }

}

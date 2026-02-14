import { requireUrlParentDirectory } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { isContainerClass } from 'soukai-bis/models/ldp/utils';
import type Model from 'soukai-bis/models/Model';
import type Container from 'soukai-bis/models/ldp/Container';
import type { ModelConstructor } from 'soukai-bis/models/types';

import SingleModelRelation from './SingleModelRelation';

export default class IsContainedByRelation<
    Parent extends Model = Model,
    Related extends Container = Container,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public static validateRelatedClass(parent: Model, relatedClass: unknown): void {
        if (isContainerClass(relatedClass)) {
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

    public async loadFromDocumentRDF(): Promise<void> {
        // Nothing to do here
    }

    public isEmpty(): false {
        return false;
    }

    public setForeignAttributes(related: Related): void {
        const parentDocumentUrl = this.parent.getDocumentUrl();

        if (!parentDocumentUrl || !this.parent.url || related.resourceUrls.includes(parentDocumentUrl)) {
            return;
        }

        const resourceUrls = related.resourceUrls.concat([parentDocumentUrl]);

        related.setAttribute('resourceUrls', resourceUrls);
    }

}

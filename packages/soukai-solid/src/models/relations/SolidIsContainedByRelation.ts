import { arrayWithout, requireUrlParentDirectory, urlParentDirectory, urlRoot } from '@noeldemartin/utils';
import { SingleModelRelation } from 'soukai';
import type { Nullable } from '@noeldemartin/utils';
import type { Model } from 'soukai';

import { bustWeakMemoModelCache } from 'soukai-solid/models/utils';
import type SolidContainer from 'soukai-solid/models/SolidContainer';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidContainerConstructor } from 'soukai-solid/models/inference';

export default class SolidIsContainedByRelation<
    Parent extends SolidModel = SolidModel,
    Related extends SolidContainer = SolidContainer,
    RelatedClass extends SolidContainerConstructor<Related> = SolidContainerConstructor<Related>,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, 'resourceUrls', 'url');
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

        if (this.parent.usingSolidEngine()) {
            related.setOriginalAttribute('resourceUrls', resourceUrls);
        } else {
            related.setAttribute('resourceUrls', resourceUrls);
        }
    }

    public clearForeignAttributes(related: Related): void {
        const parentDocumentUrl = this.parent.getDocumentUrl();

        if (!parentDocumentUrl || !this.parent.url || !related.resourceUrls.includes(parentDocumentUrl)) {
            return;
        }

        const resourceUrls = arrayWithout(related.resourceUrls, parentDocumentUrl);

        if (this.parent.usingSolidEngine()) {
            related.setOriginalAttribute('resourceUrls', resourceUrls);
        } else {
            related.setAttribute('resourceUrls', resourceUrls);
        }
    }

    public async load(): Promise<Related | null> {
        const oldCollection = this.relatedClass.collection;
        const containerUrl = requireUrlParentDirectory(this.parent.url);

        this.related = await this.relatedClass
            .from(urlParentDirectory(containerUrl) ?? urlRoot(containerUrl))
            .find(containerUrl);

        this.relatedClass.collection = oldCollection;

        return this.related;
    }

    protected onRelatedUpdated(oldValue: Nullable<Model>, newValue: Nullable<Model>): void {
        if (this !== this.parent.requireRelation(this.name)) {
            return;
        }

        bustWeakMemoModelCache(this.parent);
        bustWeakMemoModelCache(oldValue);
        bustWeakMemoModelCache(newValue);

        oldValue && this.clearInverseRelations(oldValue as Related);
        newValue && this.initializeInverseRelations(newValue as Related);
    }

}

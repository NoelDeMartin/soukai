import { arrayWithout, tap } from '@noeldemartin/utils';
import { BelongsToManyRelation, SoukaiError } from 'soukai';
import type { Attributes } from 'soukai';

import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type SolidContainer from 'soukai-solid/models/SolidContainer';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';

export default class SolidContainsRelation<
    Parent extends SolidContainer = SolidContainer,
    Related extends SolidModel = SolidModel,
    RelatedClass extends SolidModelConstructor<Related> = SolidModelConstructor<Related>,
> extends BelongsToManyRelation<Parent, Related, RelatedClass> {

    public constructor(parent: Parent, relatedClass: RelatedClass) {
        super(parent, relatedClass, 'resourceUrls', 'url');
    }

    public setForeignAttributes(related: Related): void {
        const relatedDocumentUrl = related.getDocumentUrl();

        if (!relatedDocumentUrl || !related.url || this.parent.resourceUrls.includes(relatedDocumentUrl)) {
            return;
        }

        const resourceUrls = this.parent.resourceUrls.concat([relatedDocumentUrl]);

        if (this.parent.usingSolidEngine()) {
            this.parent.setOriginalAttribute('resourceUrls', resourceUrls);
        } else {
            this.parent.setAttribute('resourceUrls', resourceUrls);
        }
    }

    public clearForeignAttributes(related: Related): void {
        const relatedDocumentUrl = related.getDocumentUrl();

        if (!relatedDocumentUrl || !related.url || !this.parent.resourceUrls.includes(relatedDocumentUrl)) {
            return;
        }

        const resourceUrls = arrayWithout(this.parent.resourceUrls, relatedDocumentUrl);

        if (this.parent.usingSolidEngine()) {
            this.parent.setOriginalAttribute('resourceUrls', resourceUrls);
        } else {
            this.parent.setAttribute('resourceUrls', resourceUrls);
        }
    }

    public async load(): Promise<Related[]> {
        this.related = this.isEmpty()
            ? []
            : await this.relatedClass.from(this.parent.url).all<Related>({
                $in: this.parent.resourceUrls,
            });

        return this.related;
    }

    public async create(attributes: Attributes = {}): Promise<Related> {
        this.assertParentExists();

        const related = this.relatedClass.newInstance(attributes);

        if (!related.url && related.static('mintsUrls') && !usingExperimentalActivityPods()) {
            this.relatedClass.withCollection(this.parent.url, () => related.mintUrl());
        }

        return tap(this.attach(related), (model) => this.save(model));
    }

    public async save(model: Related): Promise<Related> {
        this.assertParentExists();

        return tap(model, async () => {
            await model.save(this.parent.url);

            this.setForeignAttributes(model);

            await this.parent.save();
        });
    }

    public async delete(modelOrUrl: Related | string): Promise<void> {
        const model =
            modelOrUrl instanceof this.relatedClass
                ? modelOrUrl
                : this.related?.find((instance) => instance.url === modelOrUrl);

        if (!model) {
            return;
        }

        await model.delete();

        if (this.related) {
            this.related = arrayWithout(this.related, model);
        }
    }

    protected assertParentExists(): void {
        if (this.parent.exists()) {
            return;
        }

        throw new SoukaiError('Cannot save a model because the container doesn\'t exist');
    }

}

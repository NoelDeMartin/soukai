import type { Quad } from '@rdfjs/types';

import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import MultiModelRelation from './MultiModelRelation';
import { classMarker } from './helpers';
import type { GetRelatedModelInput } from './types';

export default class DocumentContainsManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass, never> {

    public static [classMarker] = ['DocumentContainsManyRelation', ...MultiModelRelation[classMarker]];

    public async load(): Promise<Related[]> {
        this.related = [];

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: { modelsCache?: Map<string, Model> } = {}): Promise<void> {
        this.related = await this.relatedClass.createManyFromRDF(quads, { modelsCache: options.modelsCache });
        this.documentModelsLoaded = true;
        this.__modelsInSameDocument = this.related;
    }

    public addForeignAttributes<T extends GetRelatedModelInput<RelatedClass, never>>(attributes: T): T {
        // nothing to do here, the related class doesn't have any foreign keys.

        return attributes;
    }

    public setForeignAttributes(): void {
        // nothing to do here, these models don't have any attributes pointing to each other.
    }

    protected requiresForeignKey(): boolean {
        return false;
    }

}

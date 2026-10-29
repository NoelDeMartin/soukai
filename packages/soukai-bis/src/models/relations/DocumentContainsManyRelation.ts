import type { Quad } from '@rdfjs/types';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor, ModelsCache } from 'soukai-bis/models/types';

import { CLASS_MARKER, MODELS_IN_SAME_DOCUMENT } from './internals';
import MultiModelRelation from './MultiModelRelation';
import type { DetachOptions } from './Relation';
import type { GetRelatedModelInput } from './types';

export default class DocumentContainsManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> extends MultiModelRelation<Parent, Related, RelatedClass, never> {
    public static [CLASS_MARKER] = ['DocumentContainsManyRelation', ...MultiModelRelation[CLASS_MARKER]];

    public async load(): Promise<Related[]> {
        this.related = [];

        return this.related;
    }

    public async loadFromDocumentRDF(quads: Quad[], options: { modelsCache?: ModelsCache } = {}): Promise<void> {
        this.related = await this.relatedClass.createManyFromRDF(quads, { modelsCache: options.modelsCache });
        this.documentModelsLoaded = true;
        this[MODELS_IN_SAME_DOCUMENT] = this.related;
    }

    public detach(related: Related | Related[], options: DetachOptions = {}): Related[] {
        if (!options.delete) {
            throw new SoukaiError(
                "Models contained in the same document can't be detached without deleting them, " +
                    'use the { delete: true } option instead.',
            );
        }

        return super.detach(related, options);
    }

    public addForeignAttributes<T extends GetRelatedModelInput<RelatedClass, never>>(attributes: T): T {
        // nothing to do here, the related class doesn't have any foreign keys.

        return attributes;
    }

    public setForeignAttributes(): void {
        // nothing to do here, these models don't have any attributes pointing to each other.
    }

    public clearForeignAttributes(): void {
        // nothing to do here, these models don't have any attributes pointing to each other.
    }

    protected requiresForeignKey(): boolean {
        return false;
    }
}

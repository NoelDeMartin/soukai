import { RelationNotLoaded } from 'soukai-bis/errors';
import type Model from 'soukai-bis/models/Model';

import ComputedAttributesCache from './ComputedAttributesCache';

export { default as ComputedAttribute } from './ComputedAttribute';
export { default as ComputedAttributesCache } from './ComputedAttributesCache';

export async function clearCache(): Promise<void> {
    await ComputedAttributesCache.clear();
}

export function loaded<TModel extends Model, TRelation extends string & keyof TModel>(
    model: TModel,
    relation: TRelation,
): NonNullable<TModel[TRelation]> extends Array<infer TItem> ? TItem[] : NonNullable<TModel[TRelation]> | null {
    if (!model.isRelationLoaded(relation)) {
        throw new RelationNotLoaded(model, relation);
    }

    return model[relation] as TModel[TRelation] extends (infer TItem)[]
        ? TItem[]
        : NonNullable<TModel[TRelation]> | null;
}

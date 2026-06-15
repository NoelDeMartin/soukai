import type Model from 'soukai-bis/models/Model';

import ComputedAttributesCache from './ComputedAttributesCache';
import { RelationNotLoaded } from 'soukai-bis/errors';
export { default as ComputedAttribute } from './ComputedAttribute';
export { default as ComputedAttributesCache } from './ComputedAttributesCache';

export async function clearCache(): Promise<void> {
    await ComputedAttributesCache.clear();
}

export function loaded<TModel extends Model, TRelation extends keyof TModel>(
    model: TModel,
    relation: TRelation,
): NonNullable<TModel[TRelation]> extends Array<infer TItem> ? TItem[] : NonNullable<TModel[TRelation]> | null {
    if (!model.isRelationLoaded(String(relation))) {
        throw new RelationNotLoaded();
    }

    return model[relation] as TModel[TRelation] extends (infer TItem)[]
        ? TItem[]
        : NonNullable<TModel[TRelation]> | null;
}

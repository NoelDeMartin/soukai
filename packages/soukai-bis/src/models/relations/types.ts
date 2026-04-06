import type { Constructor, Override, Pretty } from '@noeldemartin/utils';

import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

import type MultiModelRelation from './MultiModelRelation';
import type Relation from './Relation';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RelationConstructor<T extends Relation = Relation> = Constructor<T> & Omit<typeof Relation, 'new'>;
export type AnyMultiModelRelation = MultiModelRelation<any, any, any>;
export type GetRelatedModelInput<
    TRelatedClass extends ModelConstructor,
    ForeignKeyName extends keyof GetModelInput<TRelatedClass>,
> = Pretty<Override<GetModelInput<TRelatedClass>, { [K in ForeignKeyName]?: GetModelInput<TRelatedClass>[K] }>>;

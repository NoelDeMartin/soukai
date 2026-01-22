import type { Constructor } from '@noeldemartin/utils';

import type MultiModelRelation from './MultiModelRelation';
import type Relation from './Relation';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RelationConstructor<T extends Relation = Relation> = Constructor<T> & Omit<typeof Relation, 'new'>;
export type AnyMultiModelRelation = MultiModelRelation<any, any, any>;

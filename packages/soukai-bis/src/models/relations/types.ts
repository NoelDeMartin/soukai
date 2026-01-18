import type { Constructor } from '@noeldemartin/utils';

import type Relation from './Relation';

export type RelationConstructor<T extends Relation = Relation> = Constructor<T> & Omit<typeof Relation, 'new'>;

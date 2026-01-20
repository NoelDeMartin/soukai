import { arrayFrom } from '@noeldemartin/utils';

import type ContainsRelation from './ContainsRelation';
import type MultiModelRelation from './MultiModelRelation';
import type Relation from './Relation';
import type SingleModelRelation from './SingleModelRelation';

export const classMarker: unique symbol = Symbol('classMarker');

export function isMultiModelRelation(relation: Relation): relation is MultiModelRelation {
    return (
        classMarker in relation.constructor &&
        arrayFrom(relation.constructor[classMarker]).includes('MultiModelRelation')
    );
}

export function isSingleModelRelation(relation: Relation): relation is SingleModelRelation {
    return (
        classMarker in relation.constructor &&
        arrayFrom(relation.constructor[classMarker]).includes('SingleModelRelation')
    );
}

export function isContainsRelation(relation: Relation): relation is ContainsRelation {
    return (
        classMarker in relation.constructor && arrayFrom(relation.constructor[classMarker]).includes('ContainsRelation')
    );
}

import { arrayFrom } from '@noeldemartin/utils';

import type ContainsRelation from './ContainsRelation';
import type DocumentContainsManyRelation from './DocumentContainsManyRelation';
import { CLASS_MARKER } from './internals';
import type MultiModelRelation from './MultiModelRelation';
import type Relation from './Relation';
import type SingleModelRelation from './SingleModelRelation';

export function isMultiModelRelation(relation: Relation): relation is MultiModelRelation {
    return isMultiModelRelationClass(relation.constructor);
}

export function isMultiModelRelationClass(relationClass: Function): boolean {
    return CLASS_MARKER in relationClass && arrayFrom(relationClass[CLASS_MARKER]).includes('MultiModelRelation');
}

export function isSingleModelRelation(relation: Relation): relation is SingleModelRelation {
    return (
        CLASS_MARKER in relation.constructor &&
        arrayFrom(relation.constructor[CLASS_MARKER]).includes('SingleModelRelation')
    );
}

export function isContainsRelation(relation: Relation): relation is ContainsRelation {
    return (
        CLASS_MARKER in relation.constructor &&
        arrayFrom(relation.constructor[CLASS_MARKER]).includes('ContainsRelation')
    );
}

export function isDocumentContainsManyRelation(relation: Relation): relation is DocumentContainsManyRelation {
    return (
        CLASS_MARKER in relation.constructor &&
        arrayFrom(relation.constructor[CLASS_MARKER]).includes('DocumentContainsManyRelation')
    );
}

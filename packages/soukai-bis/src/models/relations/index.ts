export { default as BelongsToManyRelation } from './BelongsToManyRelation';
export { default as BelongsToOneRelation } from './BelongsToOneRelation';
export { default as ContainsRelation } from './ContainsRelation';
export { default as HasManyRelation } from './HasManyRelation';
export { default as HasOneRelation } from './HasOneRelation';
export { default as IsContainedByRelation } from './IsContainedByRelation';
export { default as MultiModelRelation } from './MultiModelRelation';
export { default as Relation } from './Relation';
export * from './Relation';
export * from './fluent';
export * from './schema';
export * from './types';
export * from './utils';

export function isCoreRelation(relation: string): boolean {
    return ['metadata', 'operations', 'tombstone'].includes(relation);
}

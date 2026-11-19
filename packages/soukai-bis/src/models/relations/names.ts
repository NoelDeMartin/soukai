export function isCoreRelation(relation: string): boolean {
    return ['metadata', 'operations', 'tombstone'].includes(relation);
}

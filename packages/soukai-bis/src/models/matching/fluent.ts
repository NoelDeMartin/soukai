import type { RDFClassesMatch } from 'soukai-bis/models/matching/RDFClassesMatcher';

export interface RDFClassesDefinition {
    readonly match: RDFClassesMatch;
    readonly classes: string[];
}

export function allOf(classes: string[]): RDFClassesDefinition {
    return { match: 'all', classes };
}

export function anyOf(classes: string[]): RDFClassesDefinition {
    return { match: 'any', classes };
}

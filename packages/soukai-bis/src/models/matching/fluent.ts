import type { RdfClassesMatch } from 'soukai-bis/models/matching/RDFClassesMatcher';

export interface RdfClassesDefinition {
    readonly match: RdfClassesMatch;
    readonly classes: string[];
}

export function allOf(classes: string[]): RdfClassesDefinition {
    return { match: 'all', classes };
}

export function anyOf(classes: string[]): RdfClassesDefinition {
    return { match: 'any', classes };
}

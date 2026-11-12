import type { NamedNode } from '@rdfjs/types';

export type RdfClassesMatch = 'all' | 'any';
export type RdfClassesInput = Iterable<string> | ((rdfClass: string) => boolean);

export default class RDFClassesMatcher {
    constructor(
        public readonly match: RdfClassesMatch,
        public readonly classes: NamedNode[],
    ) {}

    public matches(types: RdfClassesInput): boolean {
        if (typeof types !== 'function') {
            const typesSet = new Set(types);

            return this.matches((rdfClass) => typesSet.has(rdfClass));
        }

        const hasClass = types;

        return this.match === 'all'
            ? this.classes.every((rdfClass) => hasClass(rdfClass.value))
            : this.classes.some((rdfClass) => hasClass(rdfClass.value));
    }

    public clone(): RDFClassesMatcher {
        return new RDFClassesMatcher(this.match, [...this.classes]);
    }
}

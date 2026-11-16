import type { NamedNode } from '@rdfjs/types';
import { getRDFIriVariants } from 'soukai-bis/lib/rdf-prefix-aliases';

export type RDFClassesMatch = 'all' | 'any';
export type RDFClassesInput = Iterable<string> | ((rdfClass: string) => boolean);

export default class RDFClassesMatcher {
    constructor(
        public readonly match: RDFClassesMatch,
        public readonly classes: NamedNode[],
    ) {}

    public matches(types: RDFClassesInput): boolean {
        if (typeof types !== 'function') {
            const typesSet = new Set(types);

            return this.matches((rdfClass) => typesSet.has(rdfClass));
        }

        const hasClass = types;

        return this.match === 'all'
            ? this.classes.every((rdfClass) => getRDFIriVariants(rdfClass.value).some((variant) => hasClass(variant)))
            : this.classes.some((rdfClass) => getRDFIriVariants(rdfClass.value).some((variant) => hasClass(variant)));
    }

    public clone(): RDFClassesMatcher {
        return new RDFClassesMatcher(this.match, [...this.classes]);
    }
}

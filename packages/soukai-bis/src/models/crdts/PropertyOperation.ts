import type { Quad, Quad_Predicate, Quad_Subject } from '@rdfjs/types';

import Operation from './Operation';

export default abstract class PropertyOperation extends Operation {

    public constructor(
        resource: Quad_Subject,
        protected property: Quad_Predicate,
    ) {
        super(resource);
    }

    public hasPredicate(property: Quad_Predicate): boolean {
        return this.property.equals(property);
    }

    protected filterQuads(quads: Quad[]): Quad[] {
        return quads.filter((q) => !this.resource.equals(q.subject) || !this.property.equals(q.predicate));
    }

}

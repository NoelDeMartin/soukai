import Model from '@/models/Model';

import Engine from '@/engines/Engine';

export default abstract class Relation<M extends Model=Model> {

    protected parent: M;

    protected related: typeof Model;

    public constructor(parent: M, related: typeof Model) {
        this.parent = parent;
        this.related = related;
    }

    public abstract resolve(): Promise<any>;

}

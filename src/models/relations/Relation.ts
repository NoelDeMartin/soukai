import Model from '@/models/Model';

export default abstract class Relation {

    protected parent: Model;

    protected related: typeof Model;

    public constructor(parent: Model, related: typeof Model) {
        this.parent = parent;
        this.related = related;
    }

    public abstract resolve(): Promise<null | Model | Model[]>;

}

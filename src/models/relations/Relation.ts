import Model from '@/models/Model';

export default abstract class Relation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> {

    protected parent: P;

    protected related: RC;

    public constructor(parent: P, related: RC) {
        this.parent = parent;
        this.related = related;
    }

    public abstract resolve(): Promise<null | R | R[]>;

}

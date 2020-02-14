import { Model } from './model';

export abstract class Relation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> {

    protected parent: P;

    protected related: RC;

    public constructor(parent: P, related: RC);

    public abstract resolve(): Promise<null | R | R[]>;

}

export abstract class SingleModelRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends Relation<P, R, RC> {

    public abstract resolve(): Promise<null | R>;

}

export abstract class MultiModelRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends Relation<P, R, RC> {

    public abstract resolve(): Promise<R[]>;

}

export class BelongsToOneRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends SingleModelRelation<P, R, RC> {

    protected parentKeyField: string;

    protected relatedKeyField: string;

    public resolve(): Promise<null | R>;

}

export class HasManyRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends MultiModelRelation<P, R, RC> {

    protected relatedKeyField: string;

    protected parentKeyField: string;

    public resolve(): Promise<R[]>;

}

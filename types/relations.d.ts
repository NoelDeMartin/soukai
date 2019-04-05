import { Model } from './model';

export abstract class Relation {

    protected parent: Model;

    protected related: typeof Model;

    public constructor(parent: Model, related: typeof Model);

    public abstract resolve(): Promise<null | Model | Model[]>;

}

export abstract class SingleModelRelation extends Relation {

    public abstract resolve(): Promise<null | Model>;

}

export abstract class MultipleModelsRelation extends Relation {

    public abstract resolve(): Promise<Model[]>;

}

export class BelongsToOneRelation extends SingleModelRelation {

    protected parentKeyField: string;

    protected relatedKeyField: string;

    public resolve(): Promise<null | Model>;

}

export class HasManyRelation extends MultipleModelsRelation {

    protected relatedKeyField: string;

    protected parentKeyField: string;

    public resolve(): Promise<Model[]>;

}

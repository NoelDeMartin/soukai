import { Model } from './model';

export abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> {

    public name: string;
    public related: Related[] | Related | null;
    public loaded: boolean;
    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName: string,
        localKeyName?: string,
    );

    public abstract resolve(): Promise<Related[] | Related | null>;

    public unload(): void;

}

export abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends Relation<Parent, Related, RelatedClass> {

    public related: Related | null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName: string,
        localKeyName?: string,
    );

    public abstract resolve(): Promise<Related | null>;

}

export abstract class MultiModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends Relation<Parent, Related, RelatedClass> {

    public related: Related[] | null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    );

    public abstract resolve(): Promise<Related[]>;

}

export class HasOneRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public resolve(): Promise<Related | null>;

}

export class BelongsToRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends SingleModelRelation<Parent, Related, RelatedClass> {

    public resolve(): Promise<Related | null>;

}

export class HasManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public resolve(): Promise<Related[]>;

}

export class BelongsToManyRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends MultiModelRelation<Parent, Related, RelatedClass> {

    public resolve(): Promise<Related[]>;

}

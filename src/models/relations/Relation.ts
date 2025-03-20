import { arrayFrom } from '@noeldemartin/utils';
import type { Constructor } from '@noeldemartin/utils';

import type { ModelConstructor } from 'soukai/models/inference';
import type { Model } from 'soukai/models/Model';

export type RelationDeleteStrategy = null | 'cascade';
export type RelationConstructor<T extends Relation = Relation> = Constructor<T> & typeof Relation;

export type RelationCloneOptions = Partial<{
    clones: WeakMap<Model, Model>;
    constructors: WeakMap<typeof Model, typeof Model>;
}>;

export abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> {

    public static inverseRelationClasses: Constructor<Relation>[] = [];

    public name!: string;
    public related?: Related[] | Related | null;
    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;
    public enabled: boolean = true;
    public deleteStrategy: RelationDeleteStrategy = null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName: string,
        localKeyName?: string,
    ) {
        this.parent = parent;
        this.relatedClass = relatedClass;
        this.foreignKeyName = foreignKeyName;
        this.localKeyName = localKeyName || relatedClass.primaryKey;
    }

    public get loaded(): boolean {
        return this.related !== undefined;
    }

    public static(): RelationConstructor<this> {
        return this.constructor as RelationConstructor<this>;
    }

    public enable(): void {
        this.enabled = true;
    }

    public disable(): void {
        this.enabled = false;
    }

    public abstract load(): Promise<Related[] | Related | null>;
    public abstract setForeignAttributes(related: Related): void;
    public abstract addRelated(related: Related): void;
    public abstract isRelated(model: Related): boolean;

    /**
     * @deprecated This method has been renamed to `load`.
     */
    public resolve(): Promise<Related[] | Related | null> {
        return this.load();
    }

    public isEmpty(): boolean | null {
        return null;
    }

    public async getModels(): Promise<Related[]> {
        if (!this.loaded) {
            await this.load();
        }

        return this.getLoadedModels();
    }

    public getLoadedModels(): Related[] {
        return this.related ? arrayFrom(this.related) as Related[] : [];
    }

    public unload(): void {
        delete this.related;
    }

    public onDelete(strategy: RelationDeleteStrategy): this {
        this.deleteStrategy = strategy;

        return this;
    }

    public clone(options: RelationCloneOptions = {}): this {
        const clones = options.clones ?? new WeakMap;
        const constructors = options.constructors ?? new WeakMap;
        const clone = Object.create(Object.getPrototypeOf(this)) as this;

        clone.name = this.name;
        clone.parent = this.parent;
        clone.foreignKeyName = this.foreignKeyName;
        clone.localKeyName = this.localKeyName;
        clone.deleteStrategy = this.deleteStrategy;
        clone.enabled = this.enabled;

        // TODO get from parent clone relation instead
        clone.relatedClass = constructors.get(this.relatedClass) as RelatedClass ?? this.relatedClass;

        if (this.related === null)
            clone.related = null;
        else if (Array.isArray(this.related))
            clone.related = this.related.map(model => model.clone({ clones, constructors }));
        else if (this.related)
            clone.related = this.related.clone({ clones, constructors });

        return clone;
    }

    public initializeInverseRelations(model: Related): void {
        for (const relationName of this.relatedClass.relations) {
            const relationInstance = model.requireRelation(relationName);

            if (!relationInstance.enabled || !relationInstance.isInverseOf(this)) {
                continue;
            }

            relationInstance.setForeignAttributes(this.parent);
            relationInstance.addRelated(this.parent);
        }
    }

    public isInverseOf(relation: Relation): boolean {
        const isInstanceOf = (inverseClass: Constructor<Relation>) => relation instanceof inverseClass;

        return this.static().inverseRelationClasses.some(isInstanceOf)
            && relation.relatedClass === this.parent.constructor
            && relation.foreignKeyName === this.foreignKeyName
            && relation.localKeyName === this.localKeyName;
    }

}

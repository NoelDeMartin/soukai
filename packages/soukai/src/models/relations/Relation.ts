import { arrayFrom } from '@noeldemartin/utils';
import type { Constructor, Nullable } from '@noeldemartin/utils';

import { isModelClassOrSubclass } from 'soukai/models/utils';
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

    public static inverseHasRelationClasses: Constructor<Relation>[] = [];
    public static inverseBelongsToRelationClasses: Constructor<Relation>[] = [];

    public name!: string;
    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;
    public enabled: boolean = true;
    public deleteStrategy: RelationDeleteStrategy = null;
    protected _related?: Related[] | Related | null;

    public constructor(parent: Parent, relatedClass: RelatedClass, foreignKeyName: string, localKeyName?: string) {
        this.parent = parent;
        this.relatedClass = relatedClass;
        this.foreignKeyName = foreignKeyName;
        this.localKeyName = localKeyName || relatedClass.primaryKey;
    }

    public get loaded(): boolean {
        return this.related !== undefined;
    }

    public get related(): Nullable<Related[] | Related> {
        return this._related;
    }

    public set related(related: Nullable<Related[] | Related>) {
        const old = this._related;
        this._related = related;

        this.onRelatedUpdated(old, related);
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
    public abstract clearForeignAttributes(related: Related): void;
    public abstract addRelated(related: Related): void;
    public abstract removeRelated(related: Related): void;
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
        return this.related ? (arrayFrom(this.related) as Related[]) : [];
    }

    public unload(): void {
        this.related = undefined;
    }

    public onDelete(strategy: RelationDeleteStrategy): this {
        this.deleteStrategy = strategy;

        return this;
    }

    public clone(options: RelationCloneOptions = {}): this {
        const clones = options.clones ?? new WeakMap();
        const constructors = options.constructors ?? new WeakMap();
        const clone = Object.create(Object.getPrototypeOf(this)) as this;

        clone.name = this.name;
        clone.parent = this.parent;
        clone.foreignKeyName = this.foreignKeyName;
        clone.localKeyName = this.localKeyName;
        clone.deleteStrategy = this.deleteStrategy;
        clone.enabled = this.enabled;

        // TODO get from parent clone relation instead
        clone.relatedClass = (constructors.get(this.relatedClass) as RelatedClass) ?? this.relatedClass;

        if (this.related === null) {
            clone.related = null;
        } else if (Array.isArray(this.related)) {
            clone.related = this.related.map((model) => model.clone({ clones, constructors }));
        } else if (this.related) {
            clone.related = this.related.clone({ clones, constructors });
        }

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

    public clearInverseRelations(model: Related): void {
        for (const relationName of this.relatedClass.relations) {
            const relationInstance = model.requireRelation(relationName);

            if (!relationInstance.enabled || !relationInstance.isInverseOf(this)) {
                continue;
            }

            relationInstance.clearForeignAttributes(this.parent);
            relationInstance.removeRelated(this.parent);
        }
    }

    public isInverseOf(other: Relation): boolean {
        const isInstanceOf = (inverseClass: Constructor<Relation>) => other instanceof inverseClass;

        if (this.static().inverseBelongsToRelationClasses.some(isInstanceOf)) {
            return (
                isModelClassOrSubclass(this.parent.constructor as ModelConstructor, other.relatedClass) &&
                other.foreignKeyName === this.foreignKeyName &&
                other.localKeyName === this.localKeyName
            );
        }

        if (this.static().inverseHasRelationClasses.some(isInstanceOf)) {
            return (
                isModelClassOrSubclass(other.parent.constructor as ModelConstructor, this.relatedClass) &&
                this.foreignKeyName === other.foreignKeyName &&
                this.localKeyName === other.localKeyName
            );
        }

        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected onRelatedUpdated(oldValue: Nullable<Model[] | Model>, newValue: Nullable<Model[] | Model>): void {
        //
    }

}

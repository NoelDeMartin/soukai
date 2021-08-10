import { arrayFrom } from '@noeldemartin/utils';
import type { Constructor } from '@noeldemartin/utils';

import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

export type RelationDeleteStrategy = null | 'cascade';
export type RelationConstructor<T extends Relation = Relation> = Constructor<T> & typeof Relation;

export default abstract class Relation<
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

    public abstract resolve(): Promise<Related[] | Related | null>;
    public abstract setForeignAttributes(related: Related): void;
    public abstract addRelated(related: Related): void;

    public isEmpty(): boolean | null {
        return null;
    }

    public async getModels(): Promise<Related[]> {
        if (!this.loaded) {
            await this.resolve();
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

    public clone(): this {
        const clone = Object.create(Object.getPrototypeOf(this)) as this;

        clone.name = this.name;
        clone.parent = this.parent;
        clone.relatedClass = this.relatedClass;
        clone.foreignKeyName = this.foreignKeyName;
        clone.localKeyName = this.localKeyName;
        clone.deleteStrategy = this.deleteStrategy;

        if (this.related === null)
            clone.related = null;
        else if (Array.isArray(this.related))
            clone.related = this.related.map(model => model.clone());
        else if (this.related)
            clone.related = this.related.clone();

        return clone;
    }

    public initializeInverseRelations(model: Related): void {
        for (const relationName of this.relatedClass.relations) {
            const relationInstance = model.requireRelation(relationName);

            if (!relationInstance.isInverseOf(this))
                continue;

            relationInstance.setForeignAttributes(this.parent);
            relationInstance.addRelated(this.parent);
        }
    }

    protected static(): RelationConstructor<this> {
        return this.constructor as RelationConstructor<this>;
    }

    protected isInverseOf(relation: Relation): boolean {
        const isInstanceOf = (inverseClass: Constructor<Relation>) => relation instanceof inverseClass;

        return this.static().inverseRelationClasses.some(isInstanceOf)
            && relation.relatedClass === this.parent.constructor
            && relation.foreignKeyName === this.foreignKeyName
            && relation.localKeyName === this.localKeyName;
    }

}

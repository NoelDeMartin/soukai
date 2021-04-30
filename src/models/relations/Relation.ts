import { arrayFrom } from '@noeldemartin/utils';

import type { ModelConstructor } from '@/models/inference';
import type { Model } from '@/models/Model';

export type RelationDeleteStrategy = null | 'cascade';

export default abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> {

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

}

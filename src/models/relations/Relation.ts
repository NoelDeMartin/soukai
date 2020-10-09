import Model from '@/models/Model';

type RelationDeleteMode = null | 'cascade';

export default abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> {

    public name: string;
    public related: Related[] | Related | null = null;
    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;
    public deleteMode: RelationDeleteMode = null;

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
        return this.related !== null;
    }

    public abstract resolve(): Promise<Related[] | Related | null>;

    public async getModels(): Promise<Related[]> {
        if (!this.loaded) {
            await this.resolve();
        }

        return this.getLoadedModels();
    }

    public getLoadedModels(): Related[] {
        if (Array.isArray(this.related)) {
            return this.related;
        }

        if (this.related) {
            return [this.related];
        }

        return [];
    }

    public unload(): void {
        this.related = null;
    }

    public onDelete(mode: RelationDeleteMode): this {
        this.deleteMode = mode;

        return this;
    }

}

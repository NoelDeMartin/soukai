import Model from '@/models/Model';

export default abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> {

    public related: Related[] | Related | null = null;

    protected parent: Parent;
    protected relatedClass: RelatedClass;
    protected foreignKeyName: string;
    protected localKeyName: string;

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

    public unload(): void {
        this.related = null;
    }

}

import Model from '@/models/Model';
import MultiModelRelation from '@/models/relations/MultiModelRelation';

export default class HasManyRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends MultiModelRelation<P, R, RC> {

    protected relatedKeyField: string;

    protected parentKeyField: string;

    public constructor(
        parent: P,
        related: RC,
        relatedKeyField: string,
        parentKeyField: string,
    ) {
        super(parent, related);

        this.relatedKeyField = relatedKeyField;
        this.parentKeyField = parentKeyField;
    }

    public resolve(): Promise<R[]> {
        const filters = {
            [this.relatedKeyField]: this.parent.getAttribute(this.parentKeyField),
        };

        return this.related.all<R>(filters);
    }

}

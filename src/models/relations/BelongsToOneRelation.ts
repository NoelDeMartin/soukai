import Model from '@/models/Model';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

export default class BelongsToOneRelation<
    P extends Model = Model,
    R extends Model = Model,
    RC extends typeof Model = typeof Model,
> extends SingleModelRelation<P, R, RC> {

    protected parentKeyField: string;

    protected relatedKeyField: string;

    public constructor(
        parent: P,
        related: RC,
        parentKeyField: string,
        relatedKeyField: string,
    ) {
        super(parent, related);

        this.parentKeyField = parentKeyField;
        this.relatedKeyField = relatedKeyField;
    }

    public async resolve(): Promise<R | null> {
        const filters = {
            [this.relatedKeyField]: this.parent.getAttribute(this.parentKeyField),
        };

        const models = await this.related.all<R>(filters);

        return models.length > 0 ? models[0] : null;
    }

}

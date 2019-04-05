import Model from '@/models/Model';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

export default class BelongsToOneRelation extends SingleModelRelation {

    protected parentKeyField: string;

    protected relatedKeyField: string;

    public constructor(
        parent: Model,
        related: typeof Model,
        parentKeyField: string,
        relatedKeyField: string,
    ) {
        super(parent, related);

        this.parentKeyField = parentKeyField;
        this.relatedKeyField = relatedKeyField;
    }

    public async resolve(): Promise<Model | null> {
        const models = await this
            .related
            .all({ [this.relatedKeyField]: this.parent.getAttribute(this.parentKeyField) });

        return models.length > 0 ? models[0] : null;
    }

}

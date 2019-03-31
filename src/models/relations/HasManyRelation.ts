import Model from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default class HasManyRelation extends Relation {

    protected relatedKeyField: string;

    protected parentKeyField: string;

    public constructor(
        parent: Model,
        related: typeof Model,
        relatedKeyField: string,
        parentKeyField: string,
    ) {
        super(parent, related);

        this.relatedKeyField = relatedKeyField;
        this.parentKeyField = parentKeyField;
    }

    public resolve(): Promise<Model[]> {
        return this.related.all({ [this.relatedKeyField]: this.parent.getAttribute(this.parentKeyField) });
    }

}

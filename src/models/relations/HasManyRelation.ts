import Model from '@/models/Model';
import MultiModelRelation from '@/models/relations/MultiModelRelation';

export default class HasManyRelation extends MultiModelRelation {

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

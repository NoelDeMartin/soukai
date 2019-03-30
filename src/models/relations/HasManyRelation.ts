import Model, { Key } from '@/models/Model';
import Relation from '@/models/relations/Relation';

export default class HasManyRelation<M extends Model=Model> extends Relation<M> {

    protected foreignKey: Key;

    public constructor(parent: M, related: typeof Model, foreignKey: Key) {
        super(parent, related);

        this.foreignKey = foreignKey;
    }

    public resolve(): Promise<M[]> {
        return this.related.all({ [this.foreignKey]: this.parent.getPrimaryKey() });
    }

}

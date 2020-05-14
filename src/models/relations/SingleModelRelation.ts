import Model from '@/models/Model';
import Relation from '@/models/relations/Relation';

import { camelCase } from '@/internal/utils/Str';

export default abstract class SingleModelRelation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends typeof Model = typeof Model,
> extends Relation<Parent, Related, RelatedClass> {

    public related: Related | null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        foreignKeyName?: string,
        localKeyName?: string,
    ) {
        super(
            parent,
            relatedClass,
            foreignKeyName || camelCase(relatedClass.name + '_' + relatedClass.primaryKey),
            localKeyName,
        );
    }

    public abstract resolve(): Promise<Related | null>;

}

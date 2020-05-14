import Model, { FieldType } from '@/models/Model';
import Relation from '@/models/relations/Relation';

import User from './User';

export default class City extends Model {

    public static fields = {
        name: FieldType.String,
        birthRecords: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
    };

    public nativesRelationship(): Relation {
        return this.belongsToMany(User, 'birthRecords');
    }

}

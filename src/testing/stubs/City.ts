import { FieldRequired, FieldType, Model } from '@/models/index';
import type { ModelInterface, MultiModelRelation, Relation } from '@/models/index';

import User from './User';

export default class City extends Model {

    static fields = {
        name: {
            type: FieldType.String,
            required: FieldRequired.Required,
        },
        birthRecords: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
    };

    natives!: User[] | null;
    relatedNatives!: MultiModelRelation<City, User, typeof User>;

    public nativesRelationship(): Relation {
        return this.belongsToMany(User, 'birthRecords');
    }

}

export default interface City extends ModelInterface<typeof City> {}

import { FieldRequired, FieldType, Model } from '@/models/index';
import type { IModel, MultiModelRelation, Relation } from '@/models/index';

import User from './User';

export default class City extends Model {

    public static fields = {
        name: {
            type: FieldType.String,
            required: FieldRequired.Required,
        },
        birthRecords: {
            type: FieldType.Array,
            items: FieldType.Key,
        },
    };

    declare public natives: User[] | null;
    declare public relatedNatives: MultiModelRelation<City, User, typeof User>;

    public nativesRelationship(): Relation {
        return this.belongsToMany(User, 'birthRecords');
    }

}

export default interface City extends IModel<typeof City> {}

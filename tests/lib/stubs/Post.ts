import Model, { FieldType } from '@/models/Model';
import Relation from '@/models/relations/Relation';

import User from './User';

export default class Post extends Model {

    public static fields = {
        title: FieldType.String,
        body: FieldType.String,
        authorId: FieldType.Key,
    };

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}

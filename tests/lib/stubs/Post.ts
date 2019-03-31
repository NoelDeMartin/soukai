import Soukai from '@/Soukai';

import Model, { FieldType } from '@/models/Model';
import Relation from '@/models/relations/Relation';

import User from './User';

export default class Post extends Model {

    public static fields = {
        title: FieldType.String,
        body: FieldType.String,
        authorId: FieldType.Key,
    };

    public static load() {
        if (!this.loaded) {
            this.loaded = true;
            Soukai.loadModel('Post', this);
        }
    }

    private static loaded: boolean = false;

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}

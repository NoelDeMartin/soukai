import Soukai from '@/Soukai';

import Model, { FieldType } from '@/models/Model';
import Relation from '@/models/relations/Relation';

import Post from './Post';

export default class User extends Model {

    public static fields = {
        name: {
            type: FieldType.String,
            required: true,
        },
        surname: FieldType.String,
        age: FieldType.Number,
        birthDate: FieldType.Date,
        contact: {
            email: FieldType.String,
            phone: FieldType.String,
        },
        social: {
            facebook: FieldType.String,
            twitter: FieldType.String,
        },
    };

    public static load() {
        if (!this.loaded) {
            this.loaded = true;
            Soukai.loadModel('User', this);
        }
    }

    private static loaded: boolean = false;

    public postsRelationship(): Relation {
        return this.hasMany(Post, 'authorId');
    }

    public getAliasAttribute(): string {
        return this.getAttribute('name');
    }

}

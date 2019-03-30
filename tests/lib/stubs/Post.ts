import Model, { FieldType } from '@/models/Model';

import Soukai from '@/Soukai';

export default class Post extends Model {

    private static loaded: boolean = false;

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

}

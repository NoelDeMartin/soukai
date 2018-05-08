import Faker from 'faker';

import Model, { FieldType } from '@/lib/Model';
import Soukai from '@/lib/Soukai';

export default class extends Model {

    public static collection = Faker.lorem.word();

    public static fields = {
        birth_date: FieldType.Date,
        contact: {
            email: FieldType.String,
            phone: FieldType.String,
        },
        name: FieldType.String,
        social: {
            facebook: FieldType.String,
            twitter: FieldType.String,
        },
    };

    public static load() {
        if (!this.loaded) {
            this.loaded = true;
            Soukai.loadModel('Stub', this);
        }
    }

    private static loaded: boolean = false;
}

import Model, { FieldType } from '@/lib/Model';
import Soukai from '@/lib/Soukai';

import InvalidModelDefinition from '@/lib/errors/InvalidModelDefinition';

import TestSuite from '../TestSuite';

export default class extends TestSuite {

    public static title: string = 'Definitions';

    public testCollection(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static collection = 'collection';
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('collection');
    }

    public testEmptyCollection(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('stubs');
    }

    public testTimestamps(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static timestamps = ['created_at'];
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            created_at: {
                type: FieldType.Date,
                required: false,
            },
        });
    }

    public testEmptyTimestampsAndEmptyPrimaryKey(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static primaryKey = null;
            public static timestamps = false;
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({});
    }

    public testInvalidTimestamps(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static timestamps = ['foobar'];
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('Invalid timestamp field defined');
    }

    public testFields(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static fields = {
                name: {
                    type: FieldType.String,
                    required: true,
                },
                age: FieldType.Number,
                tags: {
                    type: FieldType.Array,
                    items: FieldType.String,
                },
                meta: {
                    type: FieldType.Object,
                    fields: {
                        birthdate: FieldType.Date,
                    },
                },
                cache: {
                    totalPosts: FieldType.Number,
                    totalFriends: FieldType.Number,
                },
            };
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            name: {
                type: FieldType.String,
                required: true,
            },
            age: {
                type: FieldType.Number,
                required: false,
            },
            tags: {
                type: FieldType.Array,
                required: false,
                items: {
                    type: FieldType.String,
                },
            },
            meta: {
                type: FieldType.Object,
                required: false,
                fields: {
                    birthdate: {
                        type: FieldType.Date,
                        required: false,
                    },
                },
            },
            cache: {
                type: FieldType.Object,
                required: false,
                fields: {
                    totalPosts: {
                        type: FieldType.Number,
                        required: false,
                    },
                    totalFriends: {
                        type: FieldType.Number,
                        required: false,
                    },
                },
            },
            created_at: {
                type: FieldType.Date,
                required: false,
            },
            updated_at: {
                type: FieldType.Date,
                required: false,
            },
        });
    }

    public testEmptyFields(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            created_at: {
                type: FieldType.Date,
                required: false,
            },
            updated_at: {
                type: FieldType.Date,
                required: false,
            },
        });
    }

    public testInvalidArrayField(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static fields = {
                tags: FieldType.Array,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('array requires items attribute');
    }

    public testInvalidObjectField(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static fields = {
                meta: FieldType.Object,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('object requires fields attribute');
    }

    public testInvalidTimestampField(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static timestamps = ['created_at'];

            public static fields = {
                created_at: FieldType.Date,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow(
            'created_at cannot be defined because it\'s being used as an automatic timestamp',
        );
    }

}

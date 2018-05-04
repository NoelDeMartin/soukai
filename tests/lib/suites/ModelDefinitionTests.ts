import TestSuite from '../TestSuite';

import Soukai from '../../../src/lib/Soukai';
import Model, { FieldType } from '../../../src/lib/Model';
import InvalidModelDefinition from '../../../src/lib/errors/InvalidModelDefinition';

export default class extends TestSuite {

    static title: string = 'Definitions';

    public testCollection(): void {
        class StubModel extends Model {
            static collection = 'collection';
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('collection');
    }

    public testEmptyCollection(): void {
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('stubs');
    }

    public testTimestamps(): void {
        class StubModel extends Model {
            static timestamps = ['created_at'];
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            created_at: {
                type: FieldType.Date,
                required: false,
            },
        });
    }

    public testEmptyTimestamps(): void {
        class StubModel extends Model {
            static timestamps = false;
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({});
    }

    public testInvalidTimestamps(): void {
        class StubModel extends Model {
            static timestamps = ['foobar'];
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('Invalid timestamp field defined');
    }

    public testFields(): void {
        class StubModel extends Model {
            static fields = {
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
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
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
        class StubModel extends Model {
            static fields = {
                tags: FieldType.Array,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('array requires items attribute');
    }

    public testInvalidObjectField(): void {
        class StubModel extends Model {
            static fields = {
                meta: FieldType.Object,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('object requires fields attribute');
    }

    public testInvalidTimestampField(): void {
        class StubModel extends Model {
            static timestamps = ['created_at'];

            static fields = {
                created_at: FieldType.Date,
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow('created_at field cannot be defined because it\'s being used as an automatic timestamp');
    }

}

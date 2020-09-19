import Model, { FieldType } from '@/models/Model';
import Soukai from '@/Soukai';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';

import TestSuite from '../TestSuite';

export default class extends TestSuite {

    public static title: string = 'Definitions';

    public testInstanceOf(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(new StubModel()).toBeInstanceOf(StubModel);
    }

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
            public static timestamps = ['createdAt'];
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
        });
    }

    public testEmptyTimestamps(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public static timestamps = false;
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.fields).toEqual({
            id: {
                type: FieldType.Key,
                required: false,
            },
        });
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
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            updatedAt: {
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
            createdAt: {
                type: FieldType.Date,
                required: false,
            },
            updatedAt: {
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
            public static timestamps = ['createdAt'];

            public static fields = {
                createdAt: {
                    type: FieldType.Date,
                    required: true,
                },
            };
        }

        const loadModel = () => Soukai.loadModel('Stub', StubModel);
        expect(loadModel).toThrow(InvalidModelDefinition);
        expect(loadModel).toThrow(
            'Field createdAt definition must be type date and not required because it is used an automatic timestamp',
        );
    }

    public testAccessingClassProperties(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public myArray = [];
        }

        Soukai.loadModel('Stub', StubModel);

        const model = new StubModel();

        expect(model.myArray).toEqual([]);
    }

    public testSettingClassProperties(): void {
        // tslint:disable-next-line:max-classes-per-file
        class StubModel extends Model {
            public myArray: string[] = [];
        }

        Soukai.loadModel('Stub', StubModel);

        const model = new StubModel();

        model.myArray = ['foobar'];

        expect(model.myArray).toEqual(['foobar']);
    }

    public testClassPropertiesDontModifyParentModels(): void {
        // tslint:disable-next-line:max-classes-per-file
        class Parent extends Model {
            public static classFields = ['parentField'];
            public parentProp: string[] = [];
        }

        // tslint:disable-next-line:max-classes-per-file
        class Child extends Parent {
            public static classFields = ['childField'];
            public childProp: string[] = [];
        }

        Soukai.loadModels({ Parent, Child });

        expect(Parent.classFields).toHaveLength(2);
        expect(Parent.classFields).toContain('parentProp');
        expect(Parent.classFields).toContain('parentField');

        expect(Child.classFields).toHaveLength(4);
        expect(Child.classFields).toContain('parentProp');
        expect(Child.classFields).toContain('parentField');
        expect(Child.classFields).toContain('childProp');
        expect(Child.classFields).toContain('childField');
    }

}

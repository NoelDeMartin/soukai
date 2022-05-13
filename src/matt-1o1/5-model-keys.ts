import type { Constructor } from '@noeldemartin/utils';

export interface ModelKey {
    toString(): string;
}

export type ModelConstructor<T extends Model = Model> = Constructor<T> & typeof Model;

export class Model<Key extends ModelKey = ModelKey> {

    public id!: Key;

    public static create<T extends Model>(this: ModelConstructor<T>): T {
        const ModelClass = this as ModelConstructor<T>;

        return new ModelClass();
    }

}

export interface MongoDBKey extends ModelKey {}

export class MongoDBModel extends Model<MongoDBKey> {

}

// this should work...
const model = MongoDBModel.create();

model;

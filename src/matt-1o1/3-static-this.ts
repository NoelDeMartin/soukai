import type { Constructor } from '@noeldemartin/utils';

export type ModelConstructor<T extends Model = Model> = Constructor<T> & typeof Model;

export class Model {

    public newInstance(): this {
        const ModelClass = this.constructor as ModelConstructor<this>;

        return new ModelClass();
    }

    public static create<T extends Model>(): T {
    // public static create<T extends Model>(this: ModelConstructor<T>): T {
        const ModelClass = this as ModelConstructor<T>;

        return new ModelClass();
    }

}

export class User extends Model {

    declare public name: string;

}

(new User).newInstance().name;
User.create().name;

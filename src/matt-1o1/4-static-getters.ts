import type { Constructor } from '@noeldemartin/utils';

export type ModelConstructor<T extends Model = Model> = Constructor<T> & typeof Model;

export class Model {

    public static foo: string = 'model-foo';

    public static<T extends keyof ModelConstructor<this>>(property: T): ModelConstructor<this>[T] {
        const ModelClass = this.constructor as ModelConstructor<this>;

        return ModelClass[property];
    }

    public doSomething(): void {
        this.static('foo');

        // This wouldn't work!
        // Model.foo;
    }

}

export type UserConstructor<T extends User = User> = Constructor<T> & typeof User;

export class User extends Model {

    public static foo: string = 'user-foo';
    public static bar: string = 'bar';

    // public static<T extends keyof UserConstructor<this>>(property: T): UserConstructor<this>[T] {
    //     return super.static(property as keyof ModelConstructor<this>);
    // }

    public doSomething(): void {
        this.static('foo');
        this.static('bar');
    }

}

import { z } from 'zod';

const makeActiveRecordThing = (everything: any) => {
    return {} as Whatever;
};

interface Whatever {
  something: true;
  addComputedProperty: <
    TMethodName extends string,
    TResult
  >(
    methodName: TMethodName,
    resolver: () => TResult
  ) => this & Record<TMethodName, TResult>;
}

const activeRecord = makeActiveRecordThing({
    schema: {
        id: 'string',
        firstName: 'string',
        lastName: 'string',
    },
    methods: {},
});

activeRecord.addMethod('add', async (ctx) => {});
const newActiveRecord = activeRecord
    .addComputedProperty('somethingElse', () => {
        return 'somethinng';
    })
    .addComputedProperty('somethingElse2', () => {});

export interface Constructor<T = Object> {
  new (...args: any[]): T;
}

export type ModelConstructor<T extends Model = Model> =
  Constructor<T> & typeof Model;

export class Model {

  public static foo: string = 'model-foo';

  public static<T extends keyof ModelConstructor<this>>(
      property: T,
  ): ModelConstructor<this>[T] {
      const ModelClass = this
          .constructor as ModelConstructor<this>;

      return ModelClass[property];
  }

  public doSomething(): void {
      this.static('foo');
  }

}

export type UserConstructor<T extends User = User> =
  Constructor<T> & typeof User;

export class User extends Model {

  public static foo: string = 'user-foo';
  public static bar: string = 'bar';

  public static<T extends keyof UserConstructor<this>>(
      property: T,
  ): UserConstructor<this>[T] {
      return super.static(
      property as keyof ModelConstructor<this>,
      );
  }

  public doSomething(): void {
      this.static('foo');
      this.static('bar');
  }

}

const user = new User();

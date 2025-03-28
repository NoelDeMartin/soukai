# Models

You can declare the entities in your application extending the `Model` class like this:

```js
class User extends Model {}
```

This will be enough to get you started, but you'll want to declare other fields to customize behavior.

## Attributes

You can declare a static `fields` property to configure the data types in your Model:

```js
class User extends Model {
    static fields = {
        name: FieldType.String,
        surname: FieldType.String,
        birthDate: FieldType.Date,
        interests: {
            type: FieldType.Array,
            items: FieldType.String,
        },
        contact: {
            phone: FieldType.String,
            email: FieldType.String,
        },
    };
}
```

This property should be an object where keys are field names, and values are field definitions. Field definitions can either be a `FieldType` or an object with the following attributes:

| Attribute | Type               | Default                     | Description                                                                                                                                                                                                      |
| --------- | ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| type      | `FieldType`        | `FieldType.Object`          | The expected format of the field. If this attribute is missing, the field will be assumed to be an object and attributes will be treated as field definitions instead (see the `field` attribute on this table). |
| required  | `boolean`          | `false`                     | Whether the field is required or not. Declaring a field as required may cause runtime errors if a model instance is created without them.                                                                        |
| items     | `FieldDefinition`  | Required for array fields.  | Only supported for array fields. Declares the expected format of array items. The `required` property in this definition is ignored (if the field it's missing, it'll be treated as an empty array).             |
| fields    | `FieldsDefinition` | Required for object fields. | Only supported for object fields. Declares the expected format of attributes within the nested object.                                                                                                           |

Here's an example creating a model that conforms with the example above:

```js
await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
    interests: ['sports', 'reading'],
    contact: {
        phone: '123456789',
        email: 'johndoe@example.com',
    },
});
```

> [!TIP] Using model definitions at runtime
> Once the model class has been booted, the field definitions will be expanded to have all attributes defined in the long form. It is important to keep this in mind in case the `fields` property is accessed at runtime, although that shouldn't be necessary in normal circumstances.
>
> The long form of our example above would be defined as such (`createdAt` and `updatedAt` fields are explained in the following sections):
>
> <details>
>    <summary>View example</summary>
>
> ```js
> {
>     name: {
>         type: FieldType.String,
>         required: false,
>     },
>     surname: {
>         type: FieldType.String,
>         required: false,
>     },
>     birthDate: {
>         type: FieldType.Date,
>         required: false,
>     },
>     interests: {
>         type: FieldType.Array,
>         required: false,
>         items: {
>             type: FieldType.String,
>         },
>     },
>     contact: {
>         type: FieldType.Object,
>         required: false,
>         fields: {
>             phone: {
>                 type: FieldType.String,
>                 required: false,
>             },
>             email: {
>                 type: FieldType.String,
>                 required: false,
>             },
>         },
>     },
>     createdAt: {
>         type: FieldType.Date,
>         required: false,
>     },
>     updatedAt: {
>         type: FieldType.Date,
>         required: false,
>     },
> };
> ```
>
>    </details>

### Magic attributes

Once fields are defined, you can access them like model properties as such:

```js
// These two are equivalent
console.log(`Hello, ${user.name}!`);
console.log(`Hello, ${user.getAttribute('name')}!`);
```

And of course, you can do the same to set attributes:

```js
// These two are equivalent
user.name = 'John Doe';
user.setAttribute('name', 'John Doe');
```

### Automatic timestamps

Some model timestamps can be managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

By default both timestamps are created and modified automatically, but the static property `timestamps` can be declared to control this behavior. It can either be a boolean to enable or disable the mechanism as a whole, or an array of strings indicating which timestamps to enable.

For example, if we only want the `createdAt` attribute to be managed automatically:

```js
class User extends Model {
    static timestamps = [TimestampField.CreatedAt];
}
```

> [!TIP] Using timestamps at runtime
> In the same way that fields definition is expanded when the model is loaded, this property will have its long form at runtime (an array of strings).
>
> Field definitions will also be added for the timestamps that are enabled.

### Attribute getters

In some scenarios it may be useful to create aliases or virtual attributes (attributes that are only available in the model instance and not persisted). They can be defined with an attribute getter implemented by declaring a method with the name `get{attribute-name}Attribute`. Where `{attribute-name}` is the name of the attribute starting with an uppercase letter.

Attribute getters can also override reading a real attribute.

For example, imagine that we have the following model:

```js
class User extends Model {
    static fields = {
        name: FieldType.String,
    };

    getNicknameAttribute() {
        return this.getAttribute('name');
    }
}
```

Instances of this model will respond to accessing the `nickname` property by invoking the attribute getter:

```js
const user = new User({ name: 'John Doe' });

// This is true
console.log(user.name === user.nickname);
```

> [!WARNING] ⚠️ Defining a getter does not create new attributes
> Keep in mind that doing this will only allow for such getters to be used, but the model will continue having the same attributes. This means that methods such as `getAttribute` or `getAttributes` will not take into account these virtual attributes. They will also be ignored in any interaction with engines.

### Attribute setters

In the same way that it's possible to define getters, you can define setters:

```js
class User extends Model {
    static fields = {
        name: FieldType.String,
    };

    setNicknameAttribute(value) {
        return this.setAttribute('name', value);
    }
}

const user = new User();

name.nickname = 'John Doe';

// This is true
console.log(user.name === 'John Doe');
```

### Reserved property names

By default, any property that is used on a model instance that is not defined in the class declaration will be treated as an attribute. This is what allows code such as the following to work:

```js
// Model without fields definition
class User extends Model {}

const user = new User({ name: 'John Doe' });

// "name" will be an attribute in the model
console.log(user.getAttribute('name'));
```

However, there are some reserved property names that won't be treated as attributes. All internal properties are prefixed with an underscore, for example `_attributes` which holds an object with attribute values.

Method names like `save` or `delete` won't be treated as attributes either.

If you have any property in your model that your don't want to be treated as an attribute, you can either give it an initial value in the class declaration or include it on the `classFields` static property:

```js
// Both "foo" and "bar" won't be treated as attributes
class User extends Model {
    static classFields = ['foo'];

    bar = null;
}
```

## Collections

The static property `collection` can be defined in the model class to indicate where models will be persisted. For example, the following model will be stored in the `users` collection:

```js
import { Model } from 'soukai';

class User extends Model {
    static collection = 'users';
}
```

The interpretation of what this string means will depend on the engine you're using. It could be the name of a document store if you're using the `IndexedDBEngine`, or a container url if you're using a `SolidEngine`.

If this property is omitted, the name of the collection will be inferred from the model name. This means this property will be available at runtime whether you defined it or not.

> [!TIP] Model name definition
> If the `modelName` property is not defined, the model name will be inferred from the class name.
>
> However, modern build systems often obfuscate class names in production and that produces unintended results. In order to define the model names explicitly, you can call the `bootModels` method during your application bootstrapping.
>
> There are some built-in helpers for popular bundlers, like `bootModelsFromViteGlob` and `bootModelsFromWebpackContext`.

> [!WARNING] ⚠️ Model name inflection
> The current implementation of the name inflection is naive and should be improved. At the moment, the model name is only converted to lower case and appended an 's' character. So it shouldn't be trusted to do proper pluralization.

## A note about constructors

Because of internal implementation details, you should not define a constructor in your model classes. Instead, you should override the `initialize` method.

You should think of this as your constructor, and avoid doing anything that you wouldn't do on a normal constructor (such as writing asynchronous code or causing side-effects).

Something else to keep in mind is that you can't use [magic attributes](#magic-attributes) within this initializer. They are just syntactic sugar, so you should be able to do everything you want with manual getters and setters.

> [!DANGER] Avoid doing this
>
> ```js
> class Post extends Model {
>     static fields = {
>         authorId: FieldType.Key,
>     };
>
>     constructor(attributes, exists, user) {
>         super(attributes, exists);
>
>         this.relatedAuthor.attach(user);
>
>         console.log(this.title);
>         console.log(this.author);
>     }
> }
> ```

> [!TIP] Do this instead
>
> ```js
> class Post extends Model {
>     static fields = {
>         authorId: FieldType.Key,
>     };
>
>     async initialize(attributes, exists, user) {
>         super.initialize(attributes, exists);
>
>         this.getRelation('author').attach(user);
>
>         console.log(this.getAttribute('title'));
>         console.log(this.getRelationModel('author'));
>     }
> }
> ```

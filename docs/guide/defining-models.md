# Defining Models

Database entities are called models, and their structure can be defined extending the [Model](https://soukai.js.org/api/classes/Model) class likes this:

```javascript
import { Model } from 'soukai';

class User extends Model {}
```

Simply declaring models like this is enough to get started, but you may want to read the following sections to learn how to customize their behavior.

## Fields

The static property `fields` can be defined in the model class to declare the format and expectations of model attributes.

This property should be an object where keys are field names, and values are field definitions. Field definitions can either be a [FieldType](https://soukai.js.org/api/modules#FieldType) or a [FieldDefinition](https://soukai.js.org/api/modules#FieldDefinition) with the following attributes:

| Attribute | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| type | [FieldType](https://soukai.js.org/api/modules#FieldType) | `FieldType.Object` | The expected format of the field. If this attribute is missing, the field will be assumed to be an object and attributes will be treated as field definitions instead (see the `field` attribute on this table). |
| required | `boolean` | `false` | Whether the field is required or not. Declaring a field as required may cause runtime errors if a model instance is created without them. |
| items | [FieldDefinition](https://soukai.js.org/api/modules#FieldDefinition) | Required for array fields. | Only supported for array fields. Declares the expected format of array items. The `required` property in this definition is ignored (if the field it's missing, it'll be treated as an empty array). |
| fields | [FieldsDefinition](https://soukai.js.org/api/modules#FieldsDefinition) | Required for object fields. | Only supported for object fields. Declares the expected format of attributes within the nested object. |

Here's an example combining different shapes:

```javascript
import { Model, FieldType } from 'soukai';

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

One example of creating a model that conforms with that definition is the following:

```javascript
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

::: tip Using model definitions at runtime
Once the model class has been loaded, the field definitions will be expanded to have all attributes defined in the long form. It is important to keep this in mind in case the `fields` property is accessed at runtime, although that shouldn't be necessary in normal circumstances.

The long form of our example above would be defined as such (`createdAt` and `updatedAt` fields are explained in the following section):

<details>
    <summary>Show / Hide example</summary>

```javascript
{
    name: {
        type: FieldType.String,
        required: false,
    },
    surname: {
        type: FieldType.String,
        required: false,
    },
    birthDate: {
        type: FieldType.Date,
        required: false,
    },
    interests: {
        type: FieldType.Array,
        required: false,
        items: {
            type: FieldType.String,
        },
    },
    contact: {
        type: FieldType.Object,
        required: false,
        fields: {
            phone: {
                type: FieldType.String,
                required: false,
            },
            email: {
                type: FieldType.String,
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
};
```
</details>

:::

### Magic attributes

Once fields are defined, you can access them like model properties like such:

```javascript
// These two are equivalent
console.log(`Hello, ${user.name}!`);
console.log(`Hello, ${user.getAttribute('name')}!`);
```

And of course, you can do the same to set attributes:

```javascript
// These two are equivalent
user.name = 'John Doe';
user.setAttribute('name', 'John Doe');
```

### Automatic timestamps

Some model timestamps can be managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

By default both timestamps are created and modified automatically, but the static property `timestamps` can be declared to control this behavior. It can either be a boolean to enable or disable the mechanism as a whole, or an array of strings indicating which timestamps to enable.

For example, if we only want the `createdAt` attribute to be managed automatically:

```javascript
import { Model, TimestampField } from 'soukai';

class User extends Model {

    static timestamps = [TimestampField.CreatedAt];

}
```

::: tip Using timestamps at runtime
In the same way that fields definition is expanded when the model is loaded, this attribute will have its long form at runtime (an array of strings).

Field definitions will also be added for the timestamps that are enabled.
:::

### Attribute getters

In some scenarios it may be useful to create aliases or virtual attributes (attributes that are only available in the model instance and not persisted). They can be defined with an attribute getter implemented by declaring a method with the name `get{attribute-name}Attribute`. Where `{attribute-name}` is the name of the attribute starting with an uppercase letter.

Attribute getters can also override reading a real attribute.

For example, imagine that we have the following model:

```javascript
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

```javascript
const user = new User({ name: 'John Doe' });

// This is true
console.log(user.name === user.nickname);
```

::: warning ⚠️ Defining a getter does not create new attributes
Keep in mind that doing this will only allow for such getters to be used, but the model will continue having the same attributes. This means that methods such as [getAttribute](https://soukai.js.org/api/classes/Model#getAttribute) or [getAttributes](https://soukai.js.org/api/classes/Model#getAttributes) will not take into account these virtual attributes. They will also be ignored in any interaction with engines.
:::

### Attribute setters

In the same way that it's possible to define [getters](#attribute-getters), you can also define attribute setters:

```javascript
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

```javascript
// Model without fields definition
class User extends Model {}

const user = new User();

user.name = 'John Doe';

// "name" will be an attribute in the model
console.log(user.getAttribute('name'));
```

However, there are some reserved property names that won't be treated as attributes. All internal properties are prefixed with an underscore, for example [_attributes](https://soukai.js.org/api/classes/Model#_attributes) which holds an object with attribute values.

Method names like [save](https://soukai.js.org/api/classes/Model#save) or [delete](https://soukai.js.org/api/classes/Model#delete) won't be treated as attributes either.

If you have any property in your model that your don't want to be treated as an attribute, you can either give it an initial value in the class declaration or include it on the `classFields` static property:

```javascript
// Both "foo" and "bar" won't be treated as attributes
class User extends Model {

    static classFields = ['foo'];

    bar = null;

}
```

## Collections

The static property `collection` can be defined in the model class to indicate where models will be persisted. For example, the following model will be stored in the `users` collection:

```javascript
import { Model } from 'soukai';

class User extends Model {

    static collection = 'users';

}
```

The interpretation of what this string means will depend on the engine you're using. It could be the name of a database collection, or a url to a storage location.

If this property is omitted, the name of the collection will be inferred from the model name. This means this property will be available at runtime whether you defined it or not.

::: tip Model name definition
If the [modelName](https://soukai.js.org/api/classes/Model#modelName) property is not defined, the model name will be inferred from the class name.

However, modern build systems often obfuscate class names in production and that produces unintended results. In order to define the model names explicitly, you can call the [bootModels](https://soukai.js.org/api/modules#bootModels) method during your application bootstrapping.

There are some built-in helpers for popular bundlers, like [bootModelsFromViteGlob](https://soukai.js.org/api/modules#bootModelsFromViteGlob) and [bootModelsFromWebpackContext](https://soukai.js.org/api/modules#bootModelsFromWebpackContext).
:::

::: warning ⚠️ Model name inflection
The current implementation of the name inflection is naive and should be improved. At the moment, the model name is only converted to lower case and appended an 's' character. So it shouldn't be trusted to do proper pluralization.
:::

## Relationships

Relationships are a the best way to work with related models.

Conceptually, there are three types of relationships: One-to-one, One-to-many and Many-to-many. But this taxonomy can be limiting to declare relationships in non-relational databases. This is because documents can hold array fields, and the same relationship can be represented in multiple ways.

For example, imagine that you have a `Post` model and a `User` model. Conceptually, a user can write many posts and a post can have a single author (a user). This is a One-to-many relationship, one user (the author) to many posts. However, there are different ways to model this relationship in the database:

- The post model could have an `authorId` field.
- The user model could have a `postIds` array field.
- Both `authorId` and `postIds` could be declared.

For this reason, it's more useful to declare relationships in each model indicating how they reference each other. You can do it using the following 4 methods:

| | A model references | A model is referenced by |
|-|-----------------------|-------------------------|
| **One model**  | [belongsToOne](https://soukai.js.org/api/classes/Model#belongsToOne) | [hasOne](https://soukai.js.org/api/classes/Model#hasOne) |
| **Multiple models** | [belongsToMany](https://soukai.js.org/api/classes/Model#belongsToMany) | [hasMany](https://soukai.js.org/api/classes/Model#hasMany) |

The 3 scenarios we explored above would be declared as:

- A post belongs to one user and a user has many posts.
- A user belongs to many posts and a post has one user.
- All 4 relationships can be declared.

These relations can be declared in a model defining a method with the relation name and the `Relationship` suffix.

Here's how you'd implement the first scenario:

```javascript
class Post extends Model {

    static fields = {
        authorId: FieldType.Key,
    };

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }

}

class User extends Model {

    postsRelationship() {
        return this.hasMany(Post, 'authorId');
    }

}
```

The arguments for these methods are the related model class, the foreign key name, and the local key name.

Key names can be inferred from model and primary key names. In the example above, the foreign key would have been inferred to be `userId`, but we had to declare it because it was `authorId` instead. The local key is correctly inferred to `id`, the primary key of the User model.

It's also possible to indicate what happens with related models upon deletion. For example, if you want to delete all the posts belonging to a user when they are removed:

```javascript
class User extends Model {

    postsRelationship() {
        return this.hasMany(Post, 'authorId').onDelete('cascade');
    }

}
```

Learn how to use the relationships we just defined in the [next section](/guide/using-models.html#working-with-relationships).

## TypeScript inference

So far in this guide, we've been using plain JavaScript. But the library is built using TypeScript, and it has some tricks up its sleeve to improve type inference.

One key feature is attributes type inference. If you try to write some code we've seen thus far using TypeScript, you'll end up with something like this:

```typescript
class User extends Model {

    static timestamps = [TimestampField.CreatedAt];
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

    declare public createdAt: Date;
    declare public name?: string;
    declare public surname?: string;
    declare public birthDate?: Date;
    declare public interests?: string[];
    declare public contact?: {
        phone?: string;
        email?: string;
    };
    declare public readonly nickname?: string;
    declare public author?: User;
    declare public relatedAuthor: BelongsToOneRelation<
        this,
        User,
        typeof User
    >;

    public getNicknameAttribute(): string {
        return this.getAttribute('name');
    }

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}
```

Notice how many of the attribute declarations are redundant, given the definition of static schema properties. This can be improved taking advantage of TypeScript's inference.

You can split this code in 2 files using the [defineModelSchema](https://soukai.js.org/api/modules#defineModelSchema) method like this:

```typescript
// file: User.schema.ts
import { defineModelSchema, FieldType, TimestampField } from 'soukai';

export default defineModelSchema({
    timestamps: [TimestampField.CreatedAt],
    fields: {
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
    },
});

// file: User.ts
import { BelongsToOneRelation, Relation } from 'soukai';

import Model from './User.schema.ts';

class User extends Model {

    declare public readonly nickname?: string;
    declare public author?: User;
    declare public relatedAuthor: BelongsToOneRelation<
        this,
        User,
        typeof User
    >;

    public getNicknameAttribute(): string {
        return this.getAttribute('name');
    }

    public authorRelationship(): Relation {
        return this.belongsToOne(User, 'authorId');
    }

}
```

This is a much cleaner way of declaring models, because it separates schema declarations from functionality. So you may want to use it in plain JavaScript as well.

::: warning ⚠️ Relations and aliases

We're aware that relations and aliases could also be inferred using newer TypeScript features, but this hasn't been implemented yet.

:::

## A word about constructors

Because of internal implementation details, you should not define a constructor in your model classes. Instead, you should override the [initialize](https://soukai.js.org/api/classes/Model#initialize) method.

You should think of this as your constructor, and avoid doing anything that you wouldn't do on a normal constructor (such as writing asynchronous code or causing side-effects).

Something else to keep in mind is that you can't use [magic attributes](#magic-attributes) within this initializer. They are just syntactic sugar, so you should be able to do everything you want with manual getters and setters.

::: danger ❌ Wrong
```javascript
class Post extends Model {

    static fields = {
        authorId: FieldType.Key,
    };

    constructor(attributes, exists, user) {
        super(attributes, exists);

        this.relatedAuthor.attach(user);

        console.log(this.title);
        console.log(this.author);
    }

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }

}
```
:::

::: tip ✔️ Correct
```javascript
class Post extends Model {

    static fields = {
        authorId: FieldType.Key,
    };

    async initialize(attributes, exists, user) {
        super.initialize(attributes, exists);

        this.getRelation('author').attach(user);

        console.log(this.getAttribute('title'));
        console.log(this.getRelationModel('author'));
    }

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }

}
```
:::

If you want to learn more about the internal implementation details, check out the source code of the [Model](https://github.com/NoelDeMartin/soukai/tree/main/src/models/Model.ts) class and learn how instances are initialized using Proxy.

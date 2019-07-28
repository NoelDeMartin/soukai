# Defining Models

Database entities are called models, and their structure can be defined extending the [Model](/api/classes/models.model.html) class. You'll need to load them using [Soukai.loadModel](/api/classes/reflection-45.soukai.html#loadmodel) or [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels).

Simply by declaring models like this is enough to get started, but you may want to read the following sections to learn how to customize their behaviour.

## Fields

The static attribute `fields` can be defined in the model class to declare the format and expecations of model attributes. This attribute should be an object where keys are field names and values are field definitions. Field definitions can either be a [FieldType](/api/enums/models.fieldtype.html) or a [FieldDefinition](/api/interfaces/models.fielddefinition.html) with the following attributes:

| Attribute | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| type | [FieldType](/api/enums/models.fieldtype.html) | `FieldType.Object` | The expected format of the field. If this attribute is missing, the field will be assumed to be an object and attributes will be treated as field definitions instead (see the `field` attribute on this table). |
| required | `boolean` | `false` | Whether the field is required or not. Declaring a field as required may cause runtime errors if a model instance is created without them. |
| items | [FieldDefinition](/api/interfaces/models.fielddefinition.html) | Required for array fields. | Only supported for array fields. Declares the expected format of array items. The `required` property in this definition is ignored. |
| fields | [FieldsDefinition](/api/interfaces/models.fieldsdefinition.html) | Required for object fields. | Only supported for object fields. Declares the expected format of attributes within the nested object. |

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
User.create({
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

### Automatic timestamps

Some model timestamps can be managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

By default both timestamps are created and modified automatically, but the static attribute `timestamps` can be declared to control this behaviour. It can either be a boolean to enable or disable the mechanism as a whole, or an array of strings indicating which timestamps to enable.

For example, if we only want the `createdAt` attribute to be managed automatically:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static timestamps = ['createdAt'];
}
```

::: tip Using timestamps at runtime
In the same way that fields definition is expanded when the model is loaded, this attribute will have its long form at runtime (an array of strings).

Field definitions will also be added for the timestamps that are enabled.
:::

### Attribute accessors

In some scenarios it may be useful to create aliases or virtual attributes (attributes that are only available in the model instance and not persisted). They can be defined with an attribute accessor implemented by declaring a method with the name `get{attribute-name}Attribute`. Where `{attribute-name}` is the name of the attribute starting with an uppercase letter.

Attribute accessors can also override reading a real attribute.

For example, imagine that we have the following model:

```javascript
class User extends Model {
    static fields = {
        name: FieldType.String,
    };

    public getNicknameAttribute() {
        return this.getAttribute('name');
    }
}
```

Instances of this model will respond to accessing to the `nickname` property by invoking the attribute accessor:

```javascript
const user = new User({ name: 'John Doe' });

// This is true
console.log(user.name === user.nickname);
```

::: warning ⚠️ Defining an accessor does not create new attributes
Keep in mind that doing this will only allow for such getters to be used, but the model will continue having the same attributes. This means that methods such as [getAttribute](/api/classes/models.model.html#getattribute) or [getAttributes](/api/classes/models.model.html#getattributes) will not take into account these virtual attributes. They will also be ignored in any interaction with engines.
:::

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

However, there are some reserved property names that won't be treated as attributes. All internal properties are prefixed with an underscore, for example [_attributes](/api/classes/models.model.html#_attributes) which holds an object with attribute values. As well as method names like [save](/api/classes/models.model.html#save) or [delete](/api/classes/models.model.html#delete).

If you have any property in your model that your don't want to be treated as an attribute, you can either give it an initial value in the class declaration or include it on the `classFields` static property:

```javascript
// Both "foo" and "bar" won't be treated as attributes
class User extends Model {
    static classFields = ['foo'];

    bar = null;
}
```

## Collections

The static attribute `collection` can be defined in the model class to indicate where models will be persisted. For example, the following model will be stored in the `users` collection:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static collection = 'users';
}
```

The interpretation of what this string means will depend on the engine being used (it could be the name of a database collection or a url to a storage location).

If this property is ommitted, the name of the collection will be inferred from the model name. This means this property will be available at runtime whether you defined it or not.

::: tip Model name definition
Since modern build systems don't guarantee a reliable mechanism to obtain a class names in javascript, the model name is provided explicitly when loading models using [Soukai.loadModel](/api/classes/reflection-45.soukai.html#loadmodel) or [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels).

If you are using webpack, the combination of [definitionsFromContext](/api/modules/utils.html#definitionsfromcontext) and [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels) can do the work for you using the file name.
:::

::: warning ⚠️ Model name inflection
The current implementation of the name inflection is naive and should be improved. At the moment, the model name is only converted to lower case and appended an 's' character, so it shouldn't be trusted to do proper plularization.
:::

## Relationships

There are two types of relationships than can be defined between models: SingleModel and MultiModel relationships.

SingleModel relationships return an instance of a related model. For example, if we have a model `Post` and a model `User`, the `author` of the post will be a user. Relationships are implemented by defining a method with the name `{relationship-name}Relationship` that returns a [Relation](/api/classes/models_relations.relation.html) instance. For SingleModel relationships you can use the method [belongsToOne](/api/classes/models.model.html#belongstoone):

```javascript
class User extends Model {}

class Post extends Model {
    static fields = {
        authorId: FieldType.Key,
    };

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }
}
```

MultiModel relationships return an array of related models. In the same example as before, a user would be related to multiple posts of which they are the author. To define MultiModel relationships you can use the method [hasMany](/api/classes/models.model.html#hasmany):

```javascript
class Post extends Model {
    static fields = {
        authorId: FieldType.Key,
    };
}

class User extends Model {
    postsRelationship() {
        return this.hasMany(Post, 'authorId');
    }
}
```

Learn how to use the relationships we just defined in the [next section](/guide/using-models.html#working-with-relationships).


## A word about constructors

Because of internal implementation details, it is not recommended to have a constructor when defining a model class. Instead, you can override the [initialize](/api/classes/models.model.html#initialize) method:

```javascript
class User extends Model {
    initialize(attributes, exists) {
        super.initialize(attributes, exists);

        // Instance initialization code goes here
    }
}
```

If you want to learn more about the internal implementation details, check out the source code of the [Model](https://github.com/NoelDeMartin/soukai/tree/master/src/models/Model.ts) class and look how instances are initialized.

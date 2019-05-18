# Defining Models

Database entities are called models, and their structure can be defined extending the [Model](/api/classes/models.model.html) class. In order for them to work as expected, they must be loaded using [Soukai.loadModel](/api/classes/reflection-45.soukai.html#loadmodel) or [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels) methods.

Only doing this is enough to get started, read the following sections to learn how to customize their behaviour.

## Collections

The static attribute `collection` can be defined in the model class to indicate explicitly the name or location of the collection to use. For example, the following model will be stored in the `users` collection:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static collection = 'users';
}
```

The interpretation of what this string means will depend on the engine being used (it could be the name of a database collection or a physical location). If this property is ommitted, the name of the collection will be inferred from the model name. This means this property will be available at runtime whether you defined it or not.

::: tip Model name definition
Since modern build systems don't guarantee a reliable mechanism to obtain a class name, it is provided explicitly when loading models using [Soukai.loadModel](/api/classes/reflection-45.soukai.html#loadmodel) or [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels).

If you are using webpack, the combination of [definitionsFromContext](/api/modules/utils.html#definitionsfromcontext) and [Soukai.loadModels](/api/classes/reflection-45.soukai.html#loadmodels) can do the work for you using the file name.
:::

::: warning Model name inflection
:warning: The current implementation of names inflection is naive and should be improved. At the moment, the model name is converted to lower case and appended with an 's' character, so it shouldn't be trusted to do proper plularization nor word separation.
:::

## Fields

The static attribute `fields` can be defined in the model class to indicate the format and expecations of model attributes. At the moment, this definitions are only used to transform certain types (for example, Date objects into the proper format for serialization). But they will also be used to validate in a future release. It is also a good practice to define the fields structure to provide better documentation.

This attribute should be an object where keys are field names and values are field definitions. Field definitions can either be a [FieldType](/api/enums/models.fieldtype.html) or an object with the following attributes:

| Attribute | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| type | `FieldType` | `FieldType.Object` | The expected format of the field. If this attribute is missing, the field will be assumed to be an object and all other attributes will be treated as field definitions instead. |
| required | `boolean` | `false` | Whether this field is required. |
| items | Field definition | Required for array fields. | Only supported for array fields. Indicates expected format of array items. The `required` property in this definitions is ignored. |
| fields | Attributes definition | Required for object fields. | Only supported for object fields. Indicates expected format of attributes inside nested objects. |

Here's an example combining different definition shapes:

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

::: tip Accessing this attribute at runtime
Once the model class has been loaded, the field definitions will be expanded to have all attributes defined in the long form. It is important to keep this in mind in case the `fields` property is accessed at runtime, although that shouldn't be necessary in normal circumstances.

The long form of our example above would be defined as such (`createdAt` and `updatedAt` fields are explained in the following section):

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
:::

## Automatic timestamps

Some model timestamps can be managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

By default both timestamps are managed, but the static attribute `timestamps` can be defined to control this behaviour. It can either be a boolean to enable or disable the mechanism as a whole, or an array of strings indicating which timestamps to enable.

For example, if we only want the `createdAt` attribute to be managed automatically:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static timestamps = ['createdAt'];
}
```

::: tip Using timestamps at runtime
In the same way that fields definition and the collection name are automatically defined, when the model is loaded this attribute will be expanded into its long form (an array of strings).

Keep in mind that field definitions will also be added for the timestamps that are enabled.
:::

## Attribute Accessors

In order to create aliases or virtual attributes, an attribute accessor can be implemented by defining a method with the name `get{attribute-name}Attribute`. Where `{attribute-name}` is the name of the attribute starting with an uppercase letter.

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

console.log('This is true:', user.name === user.nickname);
```

::: warning Defining an accessor does not create new attributes
Keep in mind that doing this will only allow for such getters to be used, but the model will continue having the same attributes. This means that methods such as [getAttribute](/api/classes/models.model.html#getattribute) or [getAttributes](/api/classes/models.model.html#getattributes) will not take into account these virtual attributes. They will also be ignored in any interaction with engines.
:::

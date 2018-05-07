---
sidebar: auto
footer: MIT Licensed | Copyright © 2018-present <a href="">Noel De Martin</a>
---

# Guide

## Getting Started

This library aims to provide an easy way to handle non-relational database objects in Javascript using an Object Oriented approach (hence ODM - Object Document Mapper). It provides a system to define database entities using [models](#models) and delegates the communication with the database to [engines](#engines) in a customizable way.

To get started, add the package as an npm dependency:

```bash
npm install soukai --save
```

And initialize the library with the engine of your choice. One good option to start tinkering is an [InMemoryEngine](api.html#inmemoryengine), which will only store information in memory.

```javascript
import Soukai, { InMemoryEngine } from 'soukai';

Soukai.useEngine(new InMemoryEngine());
```

Once everything is set up, you can start using models to interact with the database. Look at the following example on creating and retrieving Users:

```javascript
import { Model } from 'soukai';

class User extends Model {
}

User.create({ name: 'John', surname: 'Doe' })
    .then(() => console.log(User.all()));

// This should show an array with the User "John Doe" in the console
```

Note how all operations interacting with the database return a Promise. This, coupled with the fact that the actual communication is implemented using engines, makes the library available both for client side and server side applications.

This project is heavily influenced by [Laravel Eloquent ORM](https://laravel.com/docs/5.6/eloquent), the two main differences being that Laravel is implemented in PHP and intended for relational databases (hence ORM - Object Relational Mapper). If you are already familiar with Laravel it should be easy to understand how to use it, but it's recommended to skim through the documentation anyways to be aware of the differences.

## Defining Models

Database entities can be defined extending the [Model](api.html#model) class, and they must be loaded using [Soukai.loadModel](api.html#soukai-loadmodel) or [Soukai.loadModels](api.html#soukai-loadmodels) methods.

Only doing this is enough to get started, read the following sections to learn how to customize the behaviour.

### Collection Name

The static attribute `collection` can be defined in the model class to indicate explicitly the name of the collection to use. For example, the following model will be stored in the `users` collection:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static collection = 'users';
}
```

If this property is ommitted, the name of the collection will be inferred from the model name.

::: tip Model name definition
Since modern build systems don't guarantee a reliable mechanism to obtain a class name, it is provided explicitly when loading models using [Soukai.loadModel](api.html#soukai-loadmodel) or [Soukai.loadModels](api.html#soukai-loadmodels).

If you are using webpack, the combination of [definitionsFromContext](api.html#definitionsfromcontext) and [Soukai.loadModels](api.html#soukai-loadmodels) can do the work for you using the file name.
:::

::: warning Model name inflection
:warning: The current implementation of names inflection is naive and should be improved. At the momment, the model name is converted to lower case and appended with an 's' character, so it shouldn't be trusted to do proper plularization nor word separation.
:::

### Fields Definition

The static attribute `fields` can be defined in the model class to indicate the format and expecations of document attributes. At the moment, this definitions are only used to transform certain types (for example, Date objects into timestamps for serialization). But they will also be used to validate in the future. So it is good practice to define the fields structure also as a way of documentation.

This attribute should be an object where keys are field names and values are field definitions. Field definitions can either be a [FieldType](api.html#fieldtype) or an object with the following attributes:

| Attribute | Type | Default | Description |
| --------- | ---- | ------- | ----------- |
| type | `FieldType` | `FieldType.Object` | Expected format for the field. If this attribute is missing, the field will be assumed to be an object and all other attributes will be treated as field definitions instead. |
| required | `boolean` | `false` | Wether this field is required. |
| items | Field definition | Required (for array fields) | Only supported for array fields. Indicates expected format of array items. The `required` property in this definitions is ignored. |
| fields | Attributes definition | Required (for object fields) | Only supported for object fields. Indicates expected format of attributes inside nested objects. |

Example:

```javascript
import { Model, FieldType } from 'soukai';

class User extends Model {
    static fields = {
        name: FieldType.String,
        surname: FieldType.String,
        birth_date: FieldType.Date,
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

One example of creating a valid model using that definition is the following:

```javascript
User.create({
    name: 'John',
    surname: 'Doe',
    birth_date: new Date(),
    interests: ['sports', 'reading'],
    contact: {
        phone: '123456789',
        email: 'johndoe@example.com',
    },
});
```

::: tip Using definitions at runtime
Once the model class has been loaded, the field definitions will be expanded to have all attributes defined in the long form. It is important to keep this in mind in case the `fields` property is accessed at runtime, although that shouldn't be necessary unless some advance functionality is needed.

The long form of our example before would be defined as such (additional fields `created_at` and `updated_at` are explained in the next section):

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
    birth_date: {
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
    created_at: {
        type: FieldType.Date,
        required: false,
    },
    updated_at: {
        type: FieldType.Date,
        required: false,
    },
};
```
:::

### Automatic Timestamps

Model timestamps can be managed automatically. `created_at` will be set as the initial date when the model is created, and `updated_at` will be updated every time the model is modified.

By default both timestamps are managed, but the static attribute `timestamps` can be defined to control this behaviour. It can either be a boolean to enable or disable the mechanism as a whole, or a strings array indicating which timestamps should be active.

For example, if we only want the `created_at` attribute to be managed automatically:

```javascript
import { Model } from 'soukai';

class User extends Model {
    static timestamps = ['created_at'];
}
```

::: tip Using timestamps at runtime
In the same way as fields definition (explained in the previous section), once the model is loaded this attribute will be expanded into its long form (strings array).

Keep in mind that field definitions will also be added for active timestamps, and an error will be thrown if those fields are defined explicitly.
:::

## Performing CRUD operations

### Creating

In order to create models, there are two approaches. The first one is to create a new instance using the constructor and calling the [save](api.html#model-save) method:

```javascript
const user = new User({
    name: 'John',
    surname: 'Doe',
    birth_date: new Date(),
});
user.save().then(() => {
    // Model created
});
```

The same operation can be performed using [Model.create](api.html#model-create):

```javascript
User.create({
    name: 'John',
    surname: 'Doe',
    birth_date: new Date(),
}).then(user => {
    // Model created
});
```

### Updating

In the same way as creating, updating also provides two ways to update models. It is possible to update attributes of an existing model (using setters or [setAttribute](api.html#model-setattribute) method) and call [save](api.html#model-save) afterwards:

```javascript
user.name = 'Jane';
// or...
user.setAttribute('name', 'Jane');

user.save().then(() => {
    // Model updated
});
```

Or using [update](api.html#model-update) method:

```javascript
user.update({ name: 'Jane' }).then(() => {
    // Model updated
});
```

### Reading

Models can be retrieved using the [Model.find](api.html#model-find) method providing the document id:

```javascript
User.find('{documentId}').then(user => {
    if (user !== null) {
        // Model found
    }
});
```

And multiple models can be retrieved using [Model.all](api.html#model-all) method:

```javascript
User.all().then(users => {
    // Models found
});
```

::: warning Advanced filters and pagination
:warning: The current implementation does not support a way to paginate results or use advanced filters such as text search or filtering by fields other than id. This library is still a work in progress, and this is one of the first features to implement in the roadmap.
:::

### Deleting

Models can be deleted from the database using the [delete](api.html#model-delete) method:

```javascript
use.delete().then(() => {
    // Model deleted
});
```

## Using Engines

The communication with the Database is abstracted and can be adapted to multiple environments implementing the [Engine](api.html#engine) interface.

Depending on the scenario, this engine can directly execute queries to the database (for example, a MongoDB engine in a server side application) or it can be a wrapper doing http requests (for example, in a client side application calling the backend API).

Given the multiple possibilities that can exist, this library only provides some basic implementations and specialiced engines will be located in separated packages.

### Using a database in memory

The [InMemoryEngine](api.html#inmemoryengine) is intended as a development tool to get started quickly and can also be used to test the application without using a real database. This can be useful both for real tests and tinkering.

This engine provides no extra functionality on top of the base interface, but it exposes the object used for storing documents which can be accessed as the `database` property. One example of using this engine would be the following:

```javascript
import Soukai, { Model, InMemoryEngine } from 'soukai';

class User extends Model {}

const engine = new InMemoryEngine();

Soukai.useEngine(engine);
Soukai.loadModel('User', User);

User.create({ name: 'John', surname: 'Doe' }).then(() => {
    console.log(engine.database);
});
```

This script would log the following object:

```json
{
    "users": {
        "totalDocuments": 1,
        "documents": {
            "1": {
                "id": "1",
                "name": "John",
                "surname": "Doe"
            }
        }
    }
}
```

### Debugging

When debugging problems with the library, it is useful to be aware of what's happening under the hood with database communication, in order to better assess where the problem lies. The [LogEngine](api.html#logengine) can be used to wrap an existing engine and log to console all operations performed.

Using the same example as before:

```javascript
import Soukai, { Model, LogEngine, InMemoryEngine } from 'soukai';

class User extends Model {}

const engine = new InMemoryEngine();

Soukai.useEngine(new LogEngine(engine));
Soukai.loadModel('User', User);

User.create({ name: 'John', surname: 'Doe' });
```

This script would log the following information:

```
CREATE 'users' { name: 'John', surname: 'Doe' }
CREATED '1'
```

## Contributing

Feel free to report any bugs or provide pull requests in the [Github repository](https://github.com/noeldemartin/soukai). In case of developing new functionality, it is encouraged to [open an issue](https://github.com/NoelDeMartin/soukai/issues/new) first to discuss it before and increase the probability of being accepted.

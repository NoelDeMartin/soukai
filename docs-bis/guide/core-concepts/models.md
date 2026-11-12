# Models

Models are the main building blocks of your application, where you define all your entities and how they'll be translated to RDF.

You can define your models by extending a class created with the `defineSchema` helper. For better organization, it's recommended to declare the schema in its own file and keep the model class for your own logic:

::: code-group

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';

export default defineSchema({});
```

:::

This is enough to get you started, and these are standard JavaScript classes; so you can add your own methods and properties as well. But you'll need to declare some extra properties in the schema in order to configure each model.

## Attributes

You can declare the `fields` property in the schema to configure the attributes of your Model. Field definitions are declared using [Zod schemas](https://zod.dev/api):

```ts
import { defineSchema } from 'soukai-bis';
import { array, date, email, string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
        surname: string().optional(),
        birthDate: date().optional(),
        email: email().optional(),
        interests: array(string()).default([]),
    },
});
```

Attributes will be validated when a model is instantiated, and every time that they are updated. If any of the values doesn't conform to the schema, an `InvalidAttributesError` or `InvalidAttributeError` will be thrown.

Here's an example creating a model that conforms with the schema above:

```ts
await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
    interests: ['sports', 'reading'],
});
```

Every model also has a built-in `url` field, which serves as its primary key. You can read more about it in the [Urls](#urls) section.

::: warning TODO
Previous versions of Soukai supported some additional options in field definitions that haven't been implemented yet: `get`/`set`/`serialize`/`deserialize` hooks.
:::

### Magic attributes

Once fields are defined, you can access them like model properties as such:

```ts
// These two are equivalent (and both are typed as string)
console.log(`Hello, ${user.name}!`);
console.log(`Hello, ${user.getAttribute('name')}!`);
```

And of course, you can do the same to set attributes:

```ts
// These two are equivalent
user.name = 'John Doe';
user.setAttribute('name', 'John Doe');
```

Only fields declared in the schema will be treated as attributes, any other values passed to the constructor or `setAttributes` will be ignored.

You can also inspect model changes before saving with methods such as `isDirty()`, `getDirtyAttributes()`, or `getOriginalAttributes()`.

### Automatic timestamps

Model timestamps are managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

These are not stored as model fields, but in a separate `Metadata` model that is accessible through the built-in `metadata` relation. You can still read them as normal attributes, though:

```ts
const user = await User.create({ name: 'John' });

console.log(user.createdAt, user.updatedAt);
```

You can learn more about this in the [RDF definitions](#timestamps-in-rdf) section.

Timestamps are enabled by default, but you can disable them altogether using the `timestamps` option in the schema:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    timestamps: false,
    fields: {
        name: string(),
    },
});
```

::: warning TODO
Previous versions of Soukai supported enabling only some of the timestamps (for example, `static timestamps = [TimestampField.CreatedAt]`). At the moment, timestamps can only be enabled or disabled as a whole.
:::

### Attribute getters and setters

In some scenarios it may be useful to create aliases or virtual attributes (attributes that are only available in the model instance and not persisted). You can do it using native JavaScript getters and setters:

::: code-group

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {
    public get nickname(): string {
        return this.name;
    }

    public set nickname(value: string) {
        this.name = value;
    }
}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
    },
});
```

:::

```ts
const user = new User({ name: 'John Doe' });

// This is true
console.log(user.name === user.nickname);
```

> [!WARNING] ⚠️ Defining a getter does not create new attributes
> Keep in mind that doing this will only allow for such getters to be used, but the model will continue having the same attributes. This means that methods such as `getAttribute` or `getAttributes` will not take into account these virtual attributes. They will also be ignored in any interaction with engines.

::: warning TODO
Previous versions of Soukai supported declaring virtual attributes using methods such as `getNicknameAttribute()` and `setNicknameAttribute(value)`, which could also override reading real attributes. This hasn't been implemented yet.
:::

## Urls

In Soukai, [each model maps to an RDF resource](../solid-protocol/mental-model.md#models-are-resources). Because of that, they can be identified by the `url` attribute.

New models mint their url in the client side when they are saved, using a container url and generating a UUID. They also add a hash at the end, which can be configured with the `rdfDefaultResourceHash` option in the schema (the default is "it"):

```ts
// The url will be something like
// "https://example.org/people/2be06383-20ab-41c4-90f1-b506f5c00bde#it"
await Person.createAt('https://example.org/people/', { name: 'Alice' });
```

### Slugs

If you'd rather use a slug instead of a UUID, you can indicate which field to use with `useAsSlug()` (if you do, make sure to [configure Zod extensions](#zod-extensions)):

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string().useAsSlug(),
    },
});
```

```ts
// The url will be "https://example.org/people/alice#it"
await Person.createAt('https://example.org/people/', { name: 'Alice' });
```

If a document with the minted url already exists, a unique suffix will be appended to the url automatically (something like `https://example.org/people/alice-zHk4bA#it`).

### Manual url minting

You can also mint urls explicitly calling the `mintUrl` method, or set the `url` attribute yourself:

```ts
// You can do this...
const person = new Person({ name: 'Alice' });

person.mintUrl({ containerUrl: 'https://example.org/people/' });

await person.save();

// Or you could set the url yourself.
await Person.create({
    url: 'https://example.org/people/alice#it',
    name: 'Alice',
});
```

There are also some helper methods to work with urls, such as `getDocumentUrl()`, `getContainerUrl()`, and `getSlug()` (as well as their `require*` counterparts, which throw an error if the value is missing).

::: warning TODO
Previous versions of Soukai allowed disabling url minting using `static mintsUrls = false`. This hasn't been implemented yet.
:::

## Containers

The equivalent of collections in Soukai are containers (following the [Linked Data Platform](https://www.w3.org/TR/ldp/) terminology, used in Solid). Given the dynamic nature of Solid, container urls should not be hard-coded in the model class. Instead, they will be inferred from the model url.

Since the url of a model is not always available, there are a couple of ways to indicate the container. You can use the `from` option to read models from a container, and the `createAt` method (or the first argument of the `save` method) to create them:

```ts
// This is something you should obtain at runtime, instead of hard-coding it
const containerUrl = 'https://example.org/people/';

// Get persons from the container
const persons = await Person.all({ from: containerUrl });

// Create a new person in the container
const person = await Person.createAt(containerUrl, { name: 'Amy Doe' });

// Or...
await new Person({ name: 'Amy Doe' }).save(containerUrl);
```

The `find`, `delete` and `save` methods infer the container url from the model url, so it's not necessary to provide it once the url has been minted.

### Default container

If no container is provided, the default container of the model will be used. This is a local url inferred from the model name, for example `local://users/` for the `User` model. You can change it using the static `defaultContainerUrl` property:

```ts
Person.defaultContainerUrl = 'https://example.org/people/';

// The model will be created in "https://example.org/people/"
await Person.create({ name: 'Amy Doe' });
```

> [!WARNING] ⚠️ Model name inflection
> The current implementation of the name inflection is naive. At the moment, the model name is only converted to camel case and appended an 's' character. So it shouldn't be trusted to do proper pluralization.

### Container models

Containers can also be declared as models, extending a class created with `defineContainerSchema`. In addition to everything from a normal model, they have the following built-in definitions:

- The `ldp:Container` RDF class.
- The `name` field, mapped to the `rdfs:label` RDF property. It's also used as the slug when minting urls.
- The `resourceUrls` field, mapped to the `ldp:contains` RDF property.
- The `resources` relation, with all the documents in the container.
- Minted urls end with a trailing slash, and don't use a hash.

You can learn more about how to work with containers in the [Relations](./relations.md#contains-and-iscontainedby) section.

## RDF definitions

Because all models end up as RDF resources, there are a couple of things you should configure to map them properly: the vocabularies they use, the classes of the resources, and the properties of each field.

### RDF contexts

RDF classes and properties are identified by urls, but declaring full urls all the time can become cumbersome.

You can define reusable prefixes using the `rdfContexts` option, or the default prefix with `rdfContext`:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContexts: {
        foaf: 'http://xmlns.com/foaf/0.1/',
    },
    rdfClass: 'foaf:Person',
    fields: {
        name: string().rdfProperty('foaf:name'),
    },
});
```

In this example, `foaf:Person` will be interpreted as `http://xmlns.com/foaf/0.1/Person`, and `foaf:name` as `http://xmlns.com/foaf/0.1/name`. Values that are not urls or short-hand definitions using contexts will use the default context.

Both options are optional. The default context is `http://www.w3.org/ns/solid/terms#`, and if you use `rdfContexts`, the `default` key will be used as the default context.

Some common prefixes are available out of the box, and you don't need to declare them:

| Prefix   | Url                                           |
| -------- | --------------------------------------------- |
| `acl`    | `http://www.w3.org/ns/auth/acl#`              |
| `acp`    | `http://www.w3.org/ns/solid/acp#`             |
| `crdt`   | `https://vocab.noeldemartin.com/crdt/`        |
| `extra`  | `https://vocab.noeldemartin.com/solid-extra/` |
| `foaf`   | `http://xmlns.com/foaf/0.1/`                  |
| `ldp`    | `http://www.w3.org/ns/ldp#`                   |
| `pim`    | `http://www.w3.org/ns/pim/space#`             |
| `purl`   | `http://purl.org/dc/terms/`                   |
| `rdf`    | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs`   | `http://www.w3.org/2000/01/rdf-schema#`       |
| `schema` | `https://schema.org/`                         |
| `solid`  | `http://www.w3.org/ns/solid/terms#`           |
| `vcard`  | `http://www.w3.org/2006/vcard/ns#`            |
| `xsd`    | `http://www.w3.org/2001/XMLSchema#`           |

### RDF classes

You can indicate the resource type using the `rdfClass` option:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfClass: 'foaf:Person',
    fields: {
        name: string(),
    },
});
```

If you don't declare it, the name of the model will be used with the default context. For example, a `Person` model with `rdfContext: 'http://xmlns.com/foaf/0.1/'` will have the `foaf:Person` class.

If a resource needs more than one RDF class, you can declare them with the `rdfClasses` option instead:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'https://www.w3.org/ns/activitystreams#',
    rdfClasses: ['Activity', 'Announce'],
    fields: {
        summary: string(),
    },
});
```

The default behavior will be to match all the classes in the array, but you can also configure it to match only one of the classes with the `anyOf()` helper:

```ts
import { anyOf, defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContexts: {
        default: 'https://schema.org/',
        ical: 'http://www.w3.org/2002/12/cal/ical#',
    },
    rdfClasses: anyOf(['Action', 'ical:Vtodo']),
    fields: {
        name: string().rdfProperties(['name', 'ical:summary']),
    },
});
```

Either way, new resources will be created with all of the classes.

### RDF properties

Property names can be defined calling `rdfProperty()` on field definitions (before you do, make sure to [configure Zod extensions](#zod-extensions)):

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfClass: 'foaf:Person',
    fields: {
        name: string().rdfProperty('foaf:name'),
    },
});
```

If you don't declare it, the name of the field will be used with the default context. So the previous schema can be defined more concisely like this:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',

    // Because "Person" is not a url or short-hand definition using contexts,
    // the default context will be used.
    //
    // This will be interpreted as "foaf:Person".
    rdfClass: 'Person',

    fields: {
        // Because "foaf" is the default context, and "name" is the name
        // of the field, the property will be interpreted as "foaf:name".
        name: string(),
    },
});
```

A field can also be stored in more than one RDF property using `rdfProperties()` instead. This is useful when different applications use different vocabularies for the same data:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfClass: 'foaf:Person',
    fields: {
        name: string().rdfProperties(['foaf:name', 'vcard:fn']),
    },
});
```

The model will still have a single `name` attribute:

- When reading, the value is taken from the first property that has one, in the order they are declared.
- When writing, the same value is written to all of them.

Declaring properties disables the default behavior of using the field name to infer RDF properties, so if you want to keep using the field name you have to include it in the list: `.rdfProperties(['name', 'vcard:fn'])`.

### Converting to and from RDF

You can also inspect the RDF of a model using the `toTurtle()` and `toJsonLD()` methods, and create models from RDF using `createFromRDF()` or `createFromJsonLD()`.

### Timestamps in RDF

In order to keep track of when resources have been created or modified, timestamps are declared in a separate `Metadata` model. This is an example of the RDF that will be generated with the Person class we've been working on:

```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#it>
    a foaf:Person ;
    foaf:name "Alice" .

<#it-metadata>
    a crdt:Metadata ;
    crdt:resource <#it> ;
    crdt:createdAt "2021-01-30T11:47:24Z"^^xsd:dateTime ;
    crdt:updatedAt "2021-01-30T11:47:24Z"^^xsd:dateTime .
```

## Extending models

You can extend the schema of an existing model passing it as the first argument of `defineSchema`.

Fields and relations will be merged with the ones defined in the parent model. RDF classes, on the other hand, will be replaced if the new schema declares its own.

For example, this is how you can define the schema for an `Admin` model:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

import Person from './Person';

export default defineSchema(Person, {
    fields: {
        role: string(),
    },
});
```

The resulting model will also extend the parent class, so `Admin` models will have any methods declared in `Person`.

## Booting models

Before using any models, you'll need to boot them with `bootModels()`. This tells Soukai the names of your models, and you'll also need to call `bootCoreModels()` to register the built-in models (such as the ones used to store timestamps):

```ts
import { bootCoreModels, bootModels } from 'soukai-bis';

import User from './User';

bootCoreModels();
bootModels({ User });
```

If you're using Vite, you can boot all the models in a folder at once using `bootModelsFromViteGlob`:

```ts
import { bootCoreModels, bootModelsFromViteGlob } from 'soukai-bis';

bootCoreModels();
bootModelsFromViteGlob(import.meta.glob('./models/*.ts', { eager: true }));
```

> [!TIP] Schema files
> Files ending with `.schema` will be ignored, so you can keep your schema definitions next to your models.

> [!TIP] Model name definition
> The model name is defined when models are booted. We need to boot them explicitly to make sure they keep the intended names. If we relied on class names we could run into issues with modern build systems that obfuscate class names in production.

Once models are booted, you can also retrieve them by name using `requireBootedModel`:

```ts
import { requireBootedModel } from 'soukai-bis';

const User = requireBootedModel('User');
```

### Models registry

Some methods reference models by name, such as `requireBootedModel` or [relations](./relations.md#definition). For TypeScript to know about these names, you'll need to register your models in the `ModelsRegistry` interface:

```ts
import type Post from './Post';
import type User from './User';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Post: typeof Post;
        User: typeof User;
    }
}
```

## Constructors

Because of internal implementation details, you should not define a constructor in your model classes. Instead, you should override the `initialize` method.

You should think of this as your constructor, and avoid doing anything that you wouldn't do on a normal constructor (such as writing asynchronous code or causing side-effects).

Something else to keep in mind is that you can't use [magic attributes](#magic-attributes) within this initializer. They are just syntactic sugar, so you should be able to do everything you want with standard getters and setters.

Finally, properties assigned in the initializer must be declared with `declare` and without a default value. Otherwise, class field initializers would override them, given that they run after the parent constructor. Other than that, properties that aren't declared in the schema behave like normal class properties (they won't be validated nor persisted).

For example, here's how you could precompute a normalized text to filter long lists of tasks quickly, without normalizing them every time the filter changes:

```ts
import type { ModelConstructorOptions } from 'soukai-bis';

import Model from './Task.schema';

export default class Task extends Model {
    declare public searchText: string;

    protected initialize(attributes?: Record<string, unknown>, options?: ModelConstructorOptions): void {
        super.initialize(attributes, options);

        this.searchText = normalize(`${this.getAttribute('title')} ${this.getAttribute('description') ?? ''}`);
    }
}
```

(Keep in mind that this value won't be updated if the title or description change after the model is instantiated, so you may want to use a getter or update it when you modify those attributes.)

## Zod extensions

Some of the features you've seen in this page, such as `.useAsSlug()` and `.rdfProperty()`, are implemented as Zod extensions.

In order to use them, make sure to import `soukai-bis/patch-zod` once in your application before declaring any models (for example, in your entry point):

```ts
import 'soukai-bis/patch-zod';
```

These extensions are also declared in Zod's types, so TypeScript will know about them once `soukai-bis` is imported.

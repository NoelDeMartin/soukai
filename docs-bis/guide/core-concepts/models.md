# Models

You can declare the entities in your application by extending a class created with the `defineSchema` helper:

```js
import { defineSchema } from 'soukai-bis';

class User extends defineSchema({}) {}
```

This will be enough to get you started, but you'll want to declare some fields to customize behavior.

## Attributes

You can declare the `fields` property in the schema to configure the attributes of your Model. Field definitions are declared using [Zod](https://zod.dev) types:

```js
import { defineSchema } from 'soukai-bis';
import { array, date, email, string } from 'zod';

class User extends defineSchema({
    fields: {
        name: string(),
        surname: string().optional(),
        birthDate: date().optional(),
        email: email().optional(),
        interests: array(string()).default([]),
    },
}) {}
```

Attributes will be validated when a model is instantiated, and every time that they are updated. If any of the values doesn't conform to the schema, an `InvalidAttributesError` (in the constructor) or `InvalidAttributeError` (when updating attributes) will be thrown.

Here's an example creating a model that conforms with the schema above:

```js
await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
    interests: ['sports', 'reading'],
});
```

Every model also has a built-in `url` field, which serves as its primary key. You can read more about it in the [Urls](#urls) section.

::: warning TODO
Previous versions of Soukai supported some additional options in field definitions that haven't been implemented yet: `alias` (mirroring the value of another field), and `get`/`set`/`serialize`/`deserialize` hooks.

Nested object fields (`FieldType.Object`) haven't been documented either.
:::

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

Only fields declared in the schema will be treated as attributes, any other values passed to the constructor or `setAttributes` will be ignored.

You can also inspect model changes with methods such as `isDirty()`, `getDirtyAttributes()`, or `getOriginalAttributes()`.

### Automatic timestamps

Some model timestamps are managed automatically. `createdAt` will be set as the initial date when the model is created, and `updatedAt` will be updated every time the model is modified.

These are not stored as model fields, but in a separate `Metadata` model that is accessible through the built-in `metadata` relationship. You can still read them as normal attributes, though:

```js
const user = await User.create({ name: 'John' });

console.log(user.createdAt, user.updatedAt);
```

You can learn more about why this is the case in the [RDF definitions](#timestamps-in-rdf) section.

By default timestamps are enabled, but you can disable them using the `timestamps` option in the schema:

```js
class User extends defineSchema({
    timestamps: false,
    fields: {
        name: string(),
    },
}) {}
```

::: warning TODO
Previous versions of Soukai supported enabling only some of the timestamps (for example, `static timestamps = [TimestampField.CreatedAt]`). At the moment, timestamps can only be enabled or disabled as a whole.
:::

### Attribute getters and setters

In some scenarios it may be useful to create aliases or virtual attributes (attributes that are only available in the model instance and not persisted). You can do it using native JavaScript getters and setters:

```js
class User extends defineSchema({
    fields: {
        name: string(),
    },
}) {
    get nickname() {
        return this.name;
    }

    set nickname(value) {
        this.name = value;
    }
}

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

In Soukai, all models are RDF resources. Because of that, the primary key of a model is its `url`, rather than an `id`.

New models mint their url in the client side when they are saved, using a container url and generating a UUID. They also add a hash at the end, which can be configured with the `rdfDefaultResourceHash` option in the schema (the default is "it"):

```js
// The url will be something like "https://example.org/people/2be06383-20ab-41c4-90f1-b506f5c00bde#it"
await Person.createAt('https://example.org/people/', { name: 'Alice' });
```

If you'd rather use a slug instead of a UUID, you can indicate which field to use with `useAsSlug()`:

```js
class Person extends defineSchema({
    fields: {
        name: string().useAsSlug(),
    },
}) {}

// The url will be "https://example.org/people/alice#it"
await Person.createAt('https://example.org/people/', { name: 'Alice' });
```

If a document with the minted url already exists, a unique suffix will be appended to the url automatically (something like `https://example.org/people/alice-zHk4bA#it`).

You can also mint urls explicitly calling the `mintUrl` method, or set the `url` attribute yourself:

```js
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

```js
// This is something you would obtain at runtime
// from other models or libraries
const containerUrl = 'https://example.org/people/';

// Get persons from the container
const persons = await Person.all({ from: containerUrl });

// Create a new person in the container
const person = await Person.createAt(containerUrl, { name: 'Amy Doe' });

// Or...
await new Person({ name: 'Amy Doe' }).save(containerUrl);
```

The `find`, `delete` and `save` methods infer the container url from the model url, so it's not necessary to provide it once the url has been minted.

If no container is provided, the default container of the model will be used. This is a local url inferred from the model name, for example `local://users/` for the `User` model. You can change it using the static `defaultContainerUrl` property:

```js
Person.defaultContainerUrl = 'https://example.org/people/';

// The model will be created in "https://example.org/people/"
await Person.create({ name: 'Amy Doe' });
```

> [!TIP] Model name definition
> The model name is defined when models are booted with `bootModels` or `bootModelsFromViteGlob`. Make sure that you always boot your models, because modern build systems often obfuscate class names in production.

> [!WARNING] ⚠️ Model name inflection
> The current implementation of the name inflection is naive. At the moment, the model name is only converted to camel case and appended an 's' character. So it shouldn't be trusted to do proper pluralization.

Containers can also be declared as models, extending a class created with `defineContainerSchema`. In addition to everything from a normal model, they have the following built-in definitions:

- The `ldp:Container` RDF class.
- The `name` field, mapped to the `rdfs:label` RDF property. It's also used as the slug when minting urls.
- The `resourceUrls` field, mapped to the `ldp:contains` RDF property.
- The `resources` relationship, with all the documents in the container.
- Minted urls end with a trailing slash, and don't use a hash.

You can learn more about how to work with containers in the [Relationships](./relationships.md#contains-and-iscontainedby) section.

## RDF definitions

Because all models are RDF resources, there are a couple of things that can be defined for a model to be serialized properly.

You can indicate the resource type using the `rdfClass` option (this will be serialized as the `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` RDF property). And property names can be defined calling `rdfProperty()` on field definitions.

Here's an example illustrating both:

```js
class Person extends defineSchema({
    rdfClass: 'http://xmlns.com/foaf/0.1/Person',
    fields: {
        name: string().rdfProperty('http://xmlns.com/foaf/0.1/name'),
    },
}) {}
```

Doing this all the time can become cumbersome, given that the same namespaces will probably be used multiple times. You can define reusable prefixes using the `rdfContexts` option, or the default prefix with `rdfContext`.

Here's a definition equivalent to the previous snippet:

```js
class Person extends defineSchema({
    rdfContexts: {
        foaf: 'http://xmlns.com/foaf/0.1/',
    },
    rdfClass: 'foaf:Person',
    fields: {
        name: string().rdfProperty('foaf:name'),
    },
}) {}
```

All of these are optional, and these are their default values:

- `rdfContext` is `http://www.w3.org/ns/solid/terms#` by default. If you use `rdfContexts`, the `default` key will be used as the default context.
- Some common prefixes are available out of the box, so you don't need to declare them: `acl`, `crdt`, `foaf`, `ldp`, `pim`, `purl`, `rdf`, `rdfs`, `schema`, `solid`, `vcard`, and `xsd`.
- `rdfClass` will use the name of the model with the default context. Values that are not urls or short-hand definitions using contexts will also use the default context.
- `rdfProperty` will use the field name with the default context.

The `Person` class we defined before can be defined more concisely like this:

```js
class Person extends defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',

    // Because "Person" is not a url or short-hand definition using contexts,
    // the default context will be used. This will be interpreted as "foaf:Person".
    rdfClass: 'Person',

    fields: {
        // Because "foaf" is the default context and "name" is the name of the field,
        // the rdfProperty will be interpreted as "foaf:name".
        name: string(),
    },
}) {}
```

You can also inspect the RDF of a model using the `toTurtle()` and `toJsonLD()` methods, and create models from RDF using `createFromJsonLD()` or `createFromRDF()`.

::: warning TODO
Previous versions of Soukai supported declaring multiple RDF classes for a model (`static rdfsClasses = [...]`). At the moment, only one RDF class can be declared with `rdfClass`.
:::

### Timestamps in RDF

Previous versions of Soukai used to declare timestamps as model fields, producing the following RDF:

```turtle
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix terms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#it>
    a foaf:Person ;
    foaf:name "Alice" ;
    terms:created "2021-01-30T11:47:24Z"^^xsd:dateTime ;
    terms:modified "2021-01-30T11:47:24Z"^^xsd:dateTime .
```

This is, however, incorrect. The RDF above implies that the person "Alice" was created on January 2021. Instead, what has been created on January 2021 is this record in the Solid POD.

Because of this, timestamps are declared in a separate `Metadata` model, and this is the RDF that will be generated:

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

Legacy timestamps declared with `purl:created` and `purl:modified` will still be read, and a `crdt:Metadata` resource will be created the next time that the model is updated.

## Models vs Documents

In other ORMs, a Model usually maps to a database document, and a Model's collection maps to a database collection or table. But that's not entirely true in Soukai.

Instead, collections map to containers, and models represent RDF resources stored in documents. This is an irrelevant distinction when a document only contains a single RDF resource, but that's rarely the case. Proper RDF modeling often results in documents containing information about multiple resources (for example, the [timestamps](#timestamps-in-rdf) we've just seen).

All of this complexity is dealt with under the hood, but it is important to be aware of the distinction. You can learn more about it in the [Mental Model](../solid-protocol/mental-model.md) section.

## Extending models

You can extend the schema of an existing model passing it as the first argument of `defineSchema`. Fields and relationships will be merged with the ones defined in the parent model:

```js
class Admin extends defineSchema(User, {
    fields: {
        role: string(),
    },
}) {}
```

## A note about constructors

The constructor of a model takes the initial attributes as the first argument, and some options as the second one. For example, you can instantiate models that you know already exist in the storage using the `exists` option:

```js
const user = new User({ url: 'https://example.org/users/john#it', name: 'John' }, { exists: true });
```

::: warning TODO
Previous versions of Soukai recommended overriding an `initialize` method instead of declaring constructors in model classes. Document the recommended approach for initialization logic in soukai-bis.
:::

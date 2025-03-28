# Solid Models

If you want to store data in a Solid POD, you'll need to extend the `SolidModel` class and communicate with the POD using a `SolidEngine`:

```js
class User extends SolidModel {}

setEngine(new SolidEngine());
```

The `SolidEngine` only supports working with Solid Models, so you'll get an error if you try to store a non-Solid model using this engine. However, the inverse is not true. You can store a `SolidModel` with any of the other engines. Essentially, this means that if you're going to work with Solid, all your models should extend the `SolidModel`.

Other than that, you can use the same principles for data modeling from Soukai core. But there are some nuances to be aware of.

> [!TIP] Using TypeScript?
> If you're defining your models with schemas, make sure to use the `defineSolidModelSchema` instead.

## Models vs Documents

Soukai has been designed to work with document databases, such as IndexedDB or MongoDB. This usually means that a Soukai Model maps to a database document. And a Model's collection will map to a database collection or store. But that's not entirely true when using Solid.

With Solid, collections map to Solid containers, and models represent RDF resources. This is an irrelevant distinction when a Solid document only contains a single RDF resource, but that's rarely the case. Proper RDF modeling often results in documents containing information about multiple resources.

All of this complexity is dealt with under the hood, but it is important to be aware of the distinction. There are also some practical implications that you'll see in the following sections dealing with collections. Internally, `SolidModel` is serialized to a JSON-LD graph and different models can end up modifying the same document.

The way that models are stored in documents can be configured with relations, and there are some methods to get document information. `getDocumentUrl()` returns the document url inferred from the resource id, whilst `getSourceDocumentUrl()` returns the document url where the resource is actually stored. Most of the time, both should be the same document, but there is nothing in Solid that prevents doing otherwise.

### Data modeling and retrieval strategies

Given the mental model we just introduced, the easiest way to work with Soukai is with a single document per model within a container. But there are some other patterns you may encounter working with Solid data in the wild. We'll discuss some.

Let's say we have a collection of movies. Ideally, each movie will stored within a single document, and so the collection of documents within a container will correspond to the collection of movies. This is the typical way to retrieve a list of `Movie` models from a container following this pattern:

```js
const movies = await Movie.from('https://example.org/movies/').all();
```

This approach is Soukai's bread and butter, but it has some limitations.

For example, if you have a collection of movies in your POD, you may want to share movie lists publicly. But the way Solid works at the moment, it's not possible to selectively change the visibility of documents listed in a container. You either publish the entire container, or you don't. One approach would be to simply use different containers for each list. For example classified by genre: `/movies/comedy/`, `/movies/horror/`, etc. But that approach also has some drawbacks. It would complicate the retrieval of models using the `all()` method, you'd need to call it for each container. It also requires changing the url of a model if it has moved between lists. And finally, it doesn't support having the same movie in more than one list (unless you duplicate it).

One solution to this problem is to create another model that points to a list of movies. For example, using the [schema:ItemList](https://schema.org/ItemList) class you can hold a list of items using the `schema:itemListElement` property that each points to a movie with `schema:item`. Using [relations](#relations), you could model these relationships and retrieve the movies as such:

```js
const horrorMovies = await MoviesList.find('https://example.org/movies/lists/horror#it');
const movies = horrorMovies.items.map(async (item) => {
    item.loadRelationIfUnloaded('movie');

    return item.movie;
});
```

These two techniques should be enough to model most common use-cases in your apps. However, you won't always read data that has been created by your app (or Soukai, for that matter). Because of that, there is a final tool you can use to read models from a single document rather than from containers, and that is using the `$in` filter:

```js
const movies = await Movie.all({
    $in: ['https://example.org/movies/horror'],
});
```

This is a special behaviour in `SolidEngine`. Using [the `$in` filter](https://soukai.js.org/guide/using-models.html#using-filters) with any other engine will still retrieve one single model per id, given that all the models will always be stored in the same collection. But this was implemented in order to handle the fact that models can be spread throughout containers and documents in Solid.

## Primary keys

By default, the attribute that serves as the primary key for a `SolidModel` is `url` instead of `id`. As its name suggests, this is the url of the RDF resource that represents the model.

## Collections

The concept of collections in Solid is represented with Solid containers. Given the dynamic nature of Solid, collection names should not be hard-coded in the model class. Instead, they will be inferred from the model url. Since the url of a model is not always available, there are a couple of helper methods in the `SolidModel` class to make this easier.

You can use both `from` and `at`, which are only syntactic sugar to set the static `collection` property of a model at runtime:

```js
// This is something you would obtain at runtime
// from other models or libraries
const containerUrl = 'https://example.org/people/';

// Get persons from the container
const persons = await Person.from(containerUrl).all();

// Create a new person in the container
const person = await Person.at(containerUrl).create({ name: 'Amy Doe' });
```

The `find`, `delete` and `save` methods infer the container url from the model url, so calling `from` or `at` is not necessary. However, the `save` method accepts the container url as a first argument. This can be ignored if the model url has been minted before by calling `mintUrl` or setting the `url` attribute:

```js
const person = new Person({ name: 'Amy Doe' });

// You can either do this...
await person.save('https://example.org/people/');

// or this...
person.mintUrl('https://example.org/people/amy');

await person.save();

// or this.
person.url = 'https://example.org/people/amy#it';

await person.save();
```

## RDF definitions

When working with Solid entities, there are a couple of things that have to be defined for a model to be serialized properly as an RDF resource.

You can indicate the resource types using the `rdfsClasses` static property (these will be serialized as `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` RDF properties).

Property names can be defined using the `rdfProperty` key within the field definition.

Here's an example illustrating both:

```js
class Person extends SolidModel {
    static rdfsClasses = ['http://xmlns.com/foaf/0.1/Person'];

    static fields = {
        name: {
            type: FieldType.String,
            rdfProperty: 'http://xmlns.com/foaf/0.1/name',
        },
    };
}
```

Doing this all the time can become cumbersome, given that the same namespaces will probably be used multiple times. You can define reusable prefixes using the `rdfContexts` static property.

Here's a definition equivalent to the previous snippet:

```js
class Person extends SolidModel {
    static rdfContexts = {
        foaf: 'http://xmlns.com/foaf/0.1/',
    };

    static rdfsClasses = ['foaf:Person'];

    static fields = {
        name: {
            type: FieldType.String,
            rdfProperty: 'foaf:name',
        },
    };
}
```

As we've seen in the first example, those properties are optional. Here's their default values:

- `rdfContexts` has the following prefixes included out of the box. If you define your own, these will be merged and not overridden:

    | Prefix | Url                                           |
    | ------ | --------------------------------------------- |
    | solid  | `http://www.w3.org/ns/solid/terms#`           |
    | rdfs   | `http://www.w3.org/2000/01/rdf-schema#`       |
    | rdf    | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
    | ldp    | `http://www.w3.org/ns/ldp#`                   |
    | purl   | `http://purl.org/dc/terms/`                   |

- `rdfsClasses` is an empty array by default, but this should rarely be left empty for proper RDF modeling. Values that are not urls or short-hand definitions using contexts will use the default context (the first one defined in `rdfContexts`).

- `rdfProperty` within field definitions will use the field name with the default context (the first one defined in `rdfContexts`).

The `Person` class we defined before can be defined more concisely like this:

```js
class Person extends SolidModel {
    static rdfContexts = {
        // This will be the default context, because it is defined first.
        foaf: 'http://xmlns.com/foaf/0.1/',
    };

    // Because "Person" is not a url or short-hand definition using contexts,
    // the default context will be used. This will be interpreted as "foaf:Person".
    static rdfsClasses = ['Person'];

    static fields = {
        // Because "foaf" is the default context and "name" is the name of the field,
        // the rdfProperty will be interpreted as "foaf:name".
        name: FieldType.String,
    };
}
```

And if you're using TypeScript, you can use the `defineSolidModelSchema` method to take advantage of TypeScript inference.

There is also a `SolidContainer` class that should be used to declare container models. In addition to everything from a `SolidModel`, it has the following built-in definitions:

- The `rdfsClasses` array contains the `ldp:Container` type, it'll be merged with definitions in the model. So it actually makes sense to leave `rdfsClasses` undefined for container models.
- The `resourceUrls` field is defined as an array mapped from the `ldp:contains` RDF property.
- The relationship `documents` is defined as a belongsToMany relation with `SolidDocument` models, using the `resourceUrls` property as the foreign key. It also provides a special `contains` multi-model relationship (read more about relationships [below](#relations)).
- Minted urls will use the `name` field if it exists to generate a slug instead of a UUID, and they won't use a hash at the end (read more about url minting [below](#url-minting)).

## Url minting

New models mint the url in the client side by default, using the container url and generating a UUID. They also add a hash at the end which can be configured with the `defaultResourceHash` static property (the default is "it"):

```js
// The url will be something like "https://example.org/people/2be06383-20ab-41c4-90f1-b506f5c00bde#it"
await Person.at('https://example.org/people/').create({ name: 'Alice' });
```

If the model is a `SolidContainer` and has a `name` attribute, this will be used to create a slug instead. Container models don't use a hash in the url and end with a trailing slash. For models that are not containers, you can configure the same slug behaviour using `slugField`:

```js
class People extends SolidContainer {}

class Person extends SolidModel {
    static slugField = 'name';
}

// The url will be "https://example.org/friends/"
const container = await People.at('https://example.org/').create({ name: 'Friends' });

// The url will be "https://example.org/friends/alice#it"
await Person.at(container.url).create({ name: 'Alice' });
```

Url minting is useful in order to perform operations with models before they have been saved in the server, but it can be disabled by setting the `mintsUrls` property to `false`. You can also mint urls explicitly calling the `mintUrl` method or setting the `url` attribute:

```js
class Person extends SolidModel {
    static mintsUrls = false;
}

// You can do this...
const person = new Person({ name: 'Alice' });

person.mintUrl();

await person.save();

// Or you could set the url yourself.
await Person.create({
    url: 'http://example.org/people/alice#it',
    name: 'Alice',
});
```

> [!WARNING]
> Keep in mind that disabling this may break some relationships' initialization, when they rely on foreign keys existing. If you're disabling this and you're using such relationships, make sure to always provide an url when you're creating models.

## Relationships

In addition to the relations included with the core library, you can also use some relations that are specific to Solid Models.

### hasMany

This relation comes with some helper methods.

`create`, `save` and `attach` can be used to associate models, setting foreign keys. Models that are stored in the same document of a related model will be saved automatically when the parent model (the one who defines the relationship) is created if it didn't exist before. This can be configured with the `usingSameDocument` method.

When related models are stored in the same document, the hash of those models will be a UUID instead of the one defined in their `defaultResourceHash` static property.

For example, let's say that we want to model a Music Band with all their members, and we want to store all the RDF resources in the same document:

```js
class Band extends SolidModel {
    static rdfContexts = {
        schema: 'https://schema.org/',
    };

    static rdfsClasses = ['MusicGroup'];

    static fields = {
        name: FieldType.String,
    };

    membersRelationship() {
        return this.hasMany(Person, 'bandUrl').usingSameDocument(true);
    }
}
```

```js
class Person extends SolidModel {
    static rdfContexts = {
        schema: 'https://schema.org/',
    };

    static rdfsClasses = ['Person'];

    static fields = {
        name: FieldType.String,
        bandUrl: {
            type: FieldType.Key,
            rdfProperty: 'schema:memberOf',
        },
    };
}
```

And here's an example using those models:

```js
const acdc = await Band.find('https://example.org/bands/ac-dc');

// You can create the model yourself, and it'll be stored when the parent is saved.
acdc.relatedMembers.attach(new Person({ name: 'Bon Scott' }));

await acdc.save();

// Or you can use the create method.
// Notice how we're not specifying the bandUrl in either scenario.
await acdc.relatedMembers.create({ name: 'Angus Young' });
```

> [!NOTE]
> Given the nature of Solid, related models defined with `hasMany` will only be loaded if they can be found in the same document as the parent model (the one who defines the relationship). This also works if the foreign key is the only attribute found in the document.

### contains and isContainedBy

There is a couple of relationships that are helpful to work with Solid containers: `contains` and `isContainedBy`.

Here's an example:

```js
class MoviesContainer extends SolidModel {
    static fields = {
        name: {
            type: FieldType.String,
            rdfProperty: 'rdfs:label',
        },
    };

    moviesRelationship() {
        return this.contains(Movie);
    }
}
```

```js
class Movie extends SolidModel {
    static rdfContexts = {
        schema: 'https://schema.org/',
    };

    static rdfsClasses = ['Movie'];

    static fields = {
        title: {
            type: FieldType.String,
            rdfProperty: 'schema:name',
        },
    };

    moviesContainerRelationship() {
        return this.isContainedBy(MoviesContainer);
    }
}
```

These methods don't take foreign and local keys because they rely on the `url` of the models to resolve collections and model ids.

## Automatic Timestamps

Declaring automatic timestamps works the same way as in the core library, but there are some important differences to keep in mind.

Initially, timestamps were declared as model fields and would produce the following RDF on serialization:

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

Because of this, timestamps are now declared as fields in a separate `Metadata` model, which is accessible through the built-in `metadata` relationship. You can still use setters and getters in the main model, but keep in mind that it's just syntactic sugar but they are different models under the hood.

This is the RDF that will be generated:

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

# Mental Model

If you're just getting started with Solid, you probably aren't ready to delve into this topic. But as you advance towards mastery, there are some particularities in how this library works that you should be aware of.

Before we continue, make sure that you're already familiar with the following:

- [What is Solid?](./what-is-solid.md), the general introduction from the previous page.
- [RDF 1.1 Primer](https://www.w3.org/TR/rdf11-primer/), to learn the basics of RDF.
- [Solid Protocol](https://solidproject.org/TR/protocol) and [Linked Data Platform](https://www.w3.org/TR/ldp/), to learn how data is organized in a POD.

Soukai is an Active Record library, and most of its API will be familiar if you've used other ORMs. But the way data is organized in Solid is quite different from a traditional database, and it's important to understand how the concepts of the library map to Solid.

## Mapping Solid to Soukai

In other ORMs, a Model usually maps to a database row or document, and a Model's collection maps to a database table or collection. In Soukai, this is how concepts map to Solid:

| Solid / RDF              | Soukai                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| Container                | A container url (or a [container model](../core-concepts/models.md#containers)). |
| Document                 | There is no 1:1 equivalent, a document holds one or more models.                 |
| RDF resource             | A Model instance, whose `url` is the url of the resource.                        |
| `rdf:type`               | The `rdfClass` (or `rdfClasses`) declared in the schema.                         |
| RDF property             | A field, whose predicate can be configured with `rdfProperty()`.                 |
| Resource urls in triples | Foreign keys, managed with [relations](../core-concepts/relations.md).           |

The most important takeaway is that **models are RDF resources, not documents**. This distinction isn't too important when a document only contains a single resource, but that's rarely the case. Proper RDF modeling often results in documents containing information about multiple resources.

## Models are resources

The primary key of a model is its `url`, which is the url of an RDF resource. Usually, this will be a url with a hash, such as `https://alice.example.org/movies/spirited-away#it`. The document where the resource is stored is inferred from it, and you can get it with `getDocumentUrl()` (the same goes for the container, with `getContainerUrl()`):

```ts
const resourceUrl = 'https://alice.example.org/movies/spirited-away#it';
const movie = await Movie.findOrFail(resourceUrl);

movie.url; // https://alice.example.org/movies/spirited-away#it
movie.getDocumentUrl(); // https://alice.example.org/movies/spirited-away
movie.getContainerUrl(); // https://alice.example.org/movies/
```

Even the simplest models will result in documents with multiple resources. For example, this is the document that will be created for a movie, including its [automatic timestamps](../core-concepts/models.md#timestamps-in-rdf):

```turtle
@prefix schema: <https://schema.org/>.
@prefix crdt: <https://vocab.noeldemartin.com/crdt/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#it>
    a schema:Movie ;
    schema:name "Spirited Away" .

<#it-metadata>
    a crdt:Metadata ;
    crdt:resource <#it> ;
    crdt:createdAt "2025-05-11T15:09:40Z"^^xsd:dateTime ;
    crdt:updatedAt "2025-05-11T15:09:40Z"^^xsd:dateTime .
```

Both resources are represented by different models (`Movie` and `Metadata`), but you don't need to worry about that because the metadata is handled under the hood. Still, the same principle applies to your own models.

## Multiple models in the same document

When you declare relations, you can decide whether related models are stored in the same document or not using the `usingSameDocument()` helper.

For example, let's say we want to store the watch actions of a movie in the same document:

::: code-group

```ts [Movie.schema.ts]
import { defineSchema, hasOne } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'Movie',
    fields: {
        title: string().rdfProperty('name'),
    },
    relations: {
        action: hasOne('WatchAction', 'objectUrl').usingSameDocument(),
    },
});
```

```ts [WatchAction.schema.ts]
import { defineSchema } from 'soukai-bis';
import { date, url } from 'zod';

export default defineSchema({
    rdfContext: 'https://schema.org/',
    rdfClass: 'WatchAction',
    fields: {
        startTime: date().optional(),
        objectUrl: url().rdfProperty('object').optional(),
    },
});
```

:::

```ts
const containerUrl = 'https://alice.example.org/movies/';
const movie = await Movie.createAt(containerUrl, { title: 'Spirited Away' });

await movie.relatedAction.create({ startTime: new Date() });
```

The resulting document will look something like this (omitting timestamps):

```turtle
@prefix schema: <https://schema.org/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#it>
    a schema:Movie ;
    schema:name "Spirited Away" .

<#a6b8d1a0-2f9b-4c0f-8a8f-3f5b4f0e7c1d>
    a schema:WatchAction ;
    schema:object <#it> ;
    schema:startTime "2025-05-11T15:09:40Z"^^xsd:dateTime .
```

There are a couple of things to notice here:

- Models stored in the same document will be saved together with the parent model (the one who defines the relation), and by default they'll be [autoloaded](../core-concepts/relations.md#autoloading).
- The hash of related models is a UUID, instead of the `rdfDefaultResourceHash` of their schema (`#it` by default). This prevents collisions between resources in the same document.

This works with `hasOne`, `hasMany`, `belongsToOne`, and `belongsToMany`. There is also a `documentContainsMany` relation, for models stored in the same document that don't reference each other (for example, the registrations of a type index). You can learn more about them in the [Relations](../core-concepts/relations.md#using-the-same-document) section.

## Models in different documents

Relations that don't use the same document will store urls pointing to resources in other documents, which is how Linked Data works across the web:

```turtle
<#it>
    a schema:WatchAction ;
    schema:object <https://alice.example.org/movies/spirited-away#it> .
```

In this case, related models need to be loaded explicitly with `loadRelation`, which will read the related documents from the engine. Keep in mind that `hasMany` and `hasOne` relations in different documents don't know where to find related models, so they'll read them from the [default container](../core-concepts/models.md#containers) of the related model (unless you indicate a different container using [`from()`](../core-concepts/relations.md#usage)).

## Data modeling strategies

Given the mental model we've introduced, the easiest way to work with Soukai is with a single document per model within a container. But there are some other patterns you may encounter working with Solid data in the wild.

### One document per model

Let's say we have a collection of movies. Ideally, each movie will be stored within a single document, and so the collection of documents within a container will correspond to the collection of movies. This is the typical way to retrieve a list of `Movie` models from a container following this pattern:

```ts
const movies = await Movie.all({ from: 'https://alice.example.org/movies/' });
```

This approach is Soukai's bread and butter, but it has some limitations.

### Lists of models

Let's say you want to share movie lists publicly. But the way Solid works at the moment, it's not possible to selectively change the visibility of documents listed in a container. You either publish the entire container, or you don't. One approach would be to use different containers for each list, with the [contains relation](../core-concepts/relations.md#contains-and-iscontainedby). For example classified by genre: `/movies/comedy/`, `/movies/horror/`, etc. But that approach also has some drawbacks. It would complicate the retrieval of all models because you'd need to load them from each container (although `Movie.all()` supports reading nested containers with the `deep` and `depth` options). It also requires changing the url of a model if it has moved between lists. And finally, it doesn't support having the same movie in more than one list (unless you duplicate it).

One solution to this problem is to create another model that points to a list of movies. For example, using the [schema:ItemList](https://schema.org/ItemList) class you can hold a list of items using the `schema:itemListElement` property that each points to a movie with `schema:item`. Using relations, you can model these with a `belongsToMany` relation pointing to items in the same document, each with a `belongsToOne` relation pointing to a movie in another document.

### Multiple models per document

These two techniques should be enough to model most common use-cases in your apps. However, you won't always read data that has been created by your app (or Soukai, for that matter). In those cases, you may need to read multiple models from specific documents rather than containers, using the `$in` option:

```ts
const movies = await Movie.all({ $in: ['https://alice.example.org/movies/horror'] });
```

Models read this way may be stored in a document other than the one inferred from their url (their _authoritative document_). For example, the document above could contain a movie with the url `https://alice.example.org/movies/spirited-away#it`. You can get the document where a model was actually read from with `getSourceDocumentUrl()` (and its container with `getSourceContainerUrl()`), and check whether it matches the authoritative document with `isInAuthoritativeDocument()`:

```ts
movie.getDocumentUrl(); // https://alice.example.org/movies/spirited-away
movie.getSourceDocumentUrl(); // https://alice.example.org/movies/horror
movie.isInAuthoritativeDocument(); // false
```

For now, models in non-authoritative documents are read-only. Saving, deleting, or reading and updating permissions will throw a `NonAuthoritativeDocument` error.

## Deleting models

Following the same principle, deleting a model doesn't necessarily delete a document. If the model is the only resource in its document (other than its metadata), the document will be deleted. Otherwise, only the resources related with the model will be removed from the document.

Also keep in mind that if you're using [the local-first approach](../advanced/local-first.md), documents will never be deleted. Instead, they'll leave a Tombstone resource behind.

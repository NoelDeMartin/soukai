# Bag of Tricks

This page gathers some low-level or niche functionality that you won't need most of the time, but can be useful in specific situations.

## Typing relation parents

[Relation instances](../core-concepts/relations.md#relation-instances) are typed automatically from the schema. However, their parent will be typed using the model defined in the schema, rather than your model class. So if you need to access methods or getters defined in your class through `relation.parent`, you can declare the relation instances manually:

::: code-group

```ts [User.ts]
import type { HasManyRelation } from 'soukai-bis';

import type Post from './Post';
import Model from './User.schema';

export default class User extends Model {
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;
}
```

```ts [Post.ts]
import type { BelongsToOneRelation } from 'soukai-bis';

import Model from './Post.schema';
import type User from './User';

export default class Post extends Model {
    declare public readonly relatedAuthor: BelongsToOneRelation<this, User, typeof User>;
}
```

:::

Each relation helper has its own relation class (`HasManyRelation` for `hasMany`, `BelongsToOneRelation` for `belongsToOne`, etc.), and they all take the same type arguments: the parent model, the related model, and the related model class.

## Using a different engine

If you need to use a different engine for a particular operation, you can use the `runWithEngine` helper. For the code running inside the callback, the default engine will be replaced with the given one. However, keep in mind that this relies on async context tracking, so you'll need to configure an `AsyncContextManager` with `setAsyncContextManager` first (for example, using Node's `AsyncLocalStorage`):

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

import type { SoukaiAsyncContext } from 'soukai-bis';

const storage = new AsyncLocalStorage<SoukaiAsyncContext>();

setAsyncContextManager({
    runWithValue: (context, operation) => storage.run(context, operation),
    getValue: () => storage.getStore(),
});

await runWithEngine(new InMemoryEngine(), () => User.create({ name: 'John Doe' }));
```

## Disabling change tracking

If you need to modify models without updating automatic timestamps or recording CRDT history operations (for example, during background maintenance or migrations), you can use `runWithChangeTrackingDisabled`. Like `runWithEngine`, this relies on the configured `AsyncContextManager` and applies to all models modified inside the callback:

```ts
await runWithChangeTrackingDisabled(async () => {
    await user.update({ name: 'Jane Doe' });
});
```

## Converting to and from RDF

Engines take care of reading and writing RDF, so you won't usually deal with it directly. But if you want to inspect the RDF of a model, or you already have some RDF that you obtained elsewhere, you can convert between the two yourself.

To get the RDF of a model, you can use the `toRDF()` method, which returns an array of [RDF/JS quads](https://rdf.js.org/data-model-spec/), or the `toTurtle()` and `toJsonLD()` methods. These include the whole document of the model, so you'll also get any other models stored in the [same document](../core-concepts/relations.md#using-the-same-document) (such as its metadata):

```ts
console.log(await user.toRDF());
console.log(await user.toTurtle());
console.log(await user.toJsonLD());
```

To go the other way around, there are four static entry points for the different RDF representations:

- `Model.fromRDF(quads)` — from an array of RDF/JS quads
- `Model.fromTurtle(turtle, { baseIRI? })` — from Turtle (relative IRIs resolve against the url passed to `find()`, unless `baseIRI` is specified)
- `Model.fromJsonLD(json, { baseIRI? })` — from JSON-LD
- `Model.fromDocument(document)` — from a `SolidDocument` (from `@noeldemartin/solid-utils`)

Each returns a builder with methods for restoring existing models, instantiating new unsaved models, or importing and saving them directly:

```ts
// Restore existing models (exists() === true, keeps original urls)
const user = await User.fromRDF(quads).find('https://example.org/users/john#it');
const user = await User.fromTurtle(turtle).find('https://example.org/users/john#it');
const user = await User.fromJsonLD(json).find(); // defaults to "@id", or pass a url
const user = await User.fromDocument(document).find('https://example.org/users/john#it');

const users = await User.fromRDF(quads).all();
const users = await User.fromTurtle(turtle, { baseIRI }).all();
const users = await User.fromJsonLD(json).all();
const users = await User.fromDocument(document).all();

// Create new unsaved models in memory (exists() === false, urls will be minted on save)
const draft = await User.fromJsonLD(externalJson).newInstance();
const drafts = await User.fromTurtle(turtle).newInstances();

// Import and save directly to the engine (mints fresh urls)
const saved = await User.fromJsonLD(externalJson).create();
const savedMany = await User.fromTurtle(turtle).createMany();
```

Single-model methods return `null` if the resource doesn't match the [RDF classes](../core-concepts/models.md#rdf-classes) of the model, and relations stored in the same document will be [autoloaded](../core-concepts/relations.md#autoloading) as usual. With `newInstance()` / `newInstances()` (and `create()` / `createMany()`), blank nodes and missing `@id`s are supported and same-document relations are reset so saving mints fresh urls for the whole graph.

Soft deleted models will be ignored unless you pass the `includeSoftDeleted` option, same as [when reading models](./local-first.md#soft-deletes).

## Disabling computed attribute refreshes

When you're doing a lot of changes at once, refreshing [computed attributes](./caching.md) after each operation can be wasteful. In those cases, you can disable refreshes and relation loading temporarily, and update the values once you're done:

```ts
import { ComputedAttribute } from 'soukai-bis';

ComputedAttribute.disableRefreshes();
ComputedAttribute.disableLoadingRelations();

try {
    for (const title of ['One', 'Two', 'Three']) {
        await user.relatedPosts.create({ title, content: '...' });
    }
} finally {
    ComputedAttribute.enableRefreshes();
    ComputedAttribute.enableLoadingRelations();
}

await user.postTitles.updateValue({ refresh: true });
```

## Marking models for deletion

Instead of deleting a model right away, you can also mark it for deletion using the `markForDeletion` method. The model will be deleted the next time it's saved:

```ts
user.markForDeletion();

// The model will be deleted from the engine at this point.
await user.save();
```

You can check whether a model has been marked for deletion with `isMarkedForDeletion`, and undo it with `unmarkForDeletion`.

This is mostly useful with models stored in the [same document](../core-concepts/relations.md#using-the-same-document) as their parent, because it allows you to delete them and save other changes in a single request when the parent is saved. That's also what happens when you call `detach` on a relation with the `{ delete: true }` option.

## Server-side url minting

Model urls are usually [minted in the client](../core-concepts/models.md#urls). If you'd rather let the POD decide the url, you can use `postToContainer` instead of `createAt`:

```ts
const person = await Person.postToContainer('https://example.org/people/', { name: 'Alice' });

console.log(person.url);
```

When using a `SolidEngine`, this will send a `POST` request to the container, using the slug of the url that would have been minted as a suggestion (in the `Slug` header). The POD may use a different url, and the model will be updated to reflect the one it chose. Other engines will simply create the document with the proposed url.

You can also do this with an existing instance, using the `postToContainer` option of the `save` method:

```ts
const alice = new Person({ name: 'Alice' });

await alice.save({ containerUrl: 'https://example.org/people/', postToContainer: true });
```

If you want to do this for all the models of a given class, you can [disable url minting](../core-concepts/models.md#disabling-url-minting) in the schema instead.

## Namespacing browser storage

In the browser, Soukai stores everything in an IndexedDB database called `soukai`. This includes the documents of the `IndexedDBEngine`, the [local changes](./local-first.md#synchronizing) pending to be synchronized, and the [computed attributes](./caching.md) cache. It also uses a `BroadcastChannel` named after it to keep browser tabs in sync.

Given that IndexedDB is scoped by origin, this means that different applications served from the same origin will share their data. This is common during development (for example, when you're running multiple apps on `localhost`), or when apps are hosted under different paths in the same domain.

To avoid conflicts, you can change the namespace with `setNamespace`:

```ts
import { setNamespace } from 'soukai-bis';

setNamespace('my-app');
```

Make sure to call it when your application boots, before any data is read or written.

> [!WARNING] ⚠️ Running multiple apps in a single origin is not safe
> Changing the namespace only prevents applications from mixing up their data by accident; but browsers still isolate storage by origin, so any application served from the same origin will be able to read others' data (as well as their `localStorage`, cookies, etc.).
>
> Given that this data comes from your users' PODs, this can be a privacy and security concern.
>
> If you don't trust all the applications served from an origin, make sure to serve yours from its own origin (for example, using a subdomain such as `my-app.example.org` instead of a path like `example.org/my-app/`).

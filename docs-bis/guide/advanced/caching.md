# Caching

Some values in your application can only be calculated by looking at related models. For example, the titles of all the posts written by a user, or the number of episodes of a show that haven't been watched yet. Computing these is easy once the relations are loaded, but loading them can be expensive, especially when models are stored in a Solid POD.

Computed attributes solve this problem by calculating these values once and caching the result. They will be loaded from the cache when models are read, and refreshed automatically when related models are saved or deleted.

> [!WARNING] ⚠️ Frontend only
> Computed attributes are cached in IndexedDB, so they can only be used in the browser.

## Definition

You can declare computed attributes using the `computed` option of a schema. Each attribute is defined with a function that receives the model and returns the computed value. In order to access related models, you should use the `loaded` helper:

```ts
import { defineSchema, hasMany, loaded } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl'),
    },
    computed: {
        postTitles: (user) => loaded(user, 'posts').map((post) => post.title),
    },
});
```

The `loaded` helper returns the related models, but it throws an error if the relation hasn't been loaded yet. This is how Soukai knows which relations it needs in order to compute a value. When that happens, the relation will be loaded and the attribute will be computed again. Relations loaded this way will be unloaded once the value has been calculated, and nested relations are also supported (for example, `loaded(season, 'episodes')` for each of the models returned by `loaded(show, 'seasons')`).

Keep in mind that compute functions must be synchronous, and their values will be stored in IndexedDB, so they should only return data that can be cloned (such as primitives, dates, arrays, and plain objects).

Similar to relations, computed attributes declared in a schema are inherited by schemas that extend it (using `defineSchema(BaseModel, { ... })`). If an attribute with the same name is declared in both, the one in the extending schema takes precedence.

## Reading values

Computed attributes can be accessed like model properties, but they return a `ComputedAttribute` instance instead of the value itself. You can read the current value with the `value` property, which will be `undefined` until the value has been computed (or restored from the cache):

```ts
const user = await User.findOrFail('https://example.org/users/john#it');

console.log(user.postTitles.value); // string[] | undefined
```

### Subscribing to changes

If you want to be notified when a value changes, you can use the `subscribe` method. The listener will be called as soon as the value is available, and every time that it changes afterwards:

```ts
const unsubscribe = user.postTitles.subscribe((titles) => {
    console.log('Post titles', titles);
});

// Later...
unsubscribe();
```

## Updating values

Computed attributes are refreshed automatically when a model is saved or deleted. This includes the computed attributes of related models, as long as the inverse relation is declared. For example, given that `Post` declares an `author` relation with the same foreign key as the `posts` relation in `User`, this will update the titles of the author:

```ts
await user.relatedPosts.create({ title: 'Hello World!', content: '...' });

console.log(user.postTitles.value); // ['Hello World!']
```

### Manual updates

When models are read, cached values are restored without loading any relations. If you want to make sure that all the computed attributes of a model have a value, you can call the `loadComputedAttributes` method (which will only compute the missing ones). You can also update a single attribute using the `updateValue` method, which returns the new value:

```ts
// Compute missing attributes (loading relations if necessary).
await user.loadComputedAttributes();

// Compute the attribute again, ignoring the cached value.
const titles = await user.postTitles.updateValue({ refresh: true });
```

The `updateValue` method accepts the following options:

- `refresh`: Ignore the cached value and compute the attribute again (defaults to `false`).
- `useCache`: Read and fall back to cached values (defaults to `true`).
- `loadRelations`: Load the missing relations (defaults to `true`). If this is disabled and some relations are missing, the value can't be computed, so the cached value will be returned instead (or `undefined`, if `useCache` is also disabled).

Concurrent updates with the same options are coalesced, so calling the method multiple times at once won't compute the value more than necessary. And if you're doing a lot of changes at once, you can also [disable refreshes temporarily](./bag-of-tricks.md#disabling-computed-attribute-refreshes).

### Invalidation strategies

Values computed on other devices won't be refreshed automatically, so cached values need to be invalidated when documents are updated during [synchronization](./local-first.md#synchronization). How this is done is determined by the invalidation strategy of each attribute:

- `InvalidationStrategies.Document` (the default): Values will be invalidated when the document of the model is synchronized. This is the best option when related models are stored in the [same document](../core-concepts/relations.md#using-the-same-document).
- `InvalidationStrategies.Container`: Values will be invalidated when any document in the container of the model (including nested containers) is synchronized. This is useful when related models are stored in different documents within the same container.

In order to use a different strategy, you need to define the attribute with an object instead of a function:

```ts
import { defineSchema, hasMany, InvalidationStrategies, loaded } from 'soukai-bis';

export default defineSchema({
    relations: {
        episodes: hasMany('Episode', 'showUrl'),
    },
    computed: {
        pendingEpisodes: {
            invalidationStrategy: InvalidationStrategies.Container,
            compute(show) {
                return loaded(show, 'episodes').filter((episode) => !episode.watched).length;
            },
        },
    },
});
```

Invalidated values will be computed again the next time that `loadComputedAttributes` or `updateValue` are called.

## Clearing cache

Computed values are cached in IndexedDB (using an in-memory copy for faster reads), and they are shared between all the browser tabs of your application. If you need to clear the cache, for example when a user logs out, you can use the `clearCache` helper:

```ts
import { clearCache } from 'soukai-bis';

await clearCache();
```

# Configuration

In order to take full advantage of the library, you should be familiar with the [Core concepts](../core-concepts/models.md).

But TLDR, Soukai implements the [Active Record](https://en.wikipedia.org/wiki/Active_record_pattern) pattern. It allows you to declare your data schema using an Object Oriented approach by extending model classes, and you can configure how it'll be persisted using different Engines.

You declare the schema of a model using the `defineSchema` helper, with [Zod](https://zod.dev) types for validation:

```js
import { defineSchema } from 'soukai-bis';
import { number, string } from 'zod';

class User extends defineSchema({
    fields: {
        name: string(),
        age: number().optional(),
    },
}) {}
```

And you can configure where the data is stored using the `setEngine` method:

```js
// Store data in a Solid POD
setEngine(new SolidEngine({ fetch: authenticatedFetch }));

// Store data in IndexedDB
setEngine(new IndexedDBEngine());

// Store data in-memory
setEngine(new InMemoryEngine());
```

Every engine stores the same RDF documents, so you can use a local engine during development (or to build [local-first](../advanced/local-first.md) apps) and the same models will work with a Solid POD.

Before using any models, you'll also need to boot them. This tells Soukai the names of your models, and registers the built-in models used internally by the library (such as the ones used to store timestamps or CRDT operations):

```js
import { bootCoreModels, bootModels } from 'soukai-bis';

bootCoreModels();
bootModels({ User, Post });
```

If you're using Vite, you can also boot all the models in a folder at once using `bootModelsFromViteGlob`:

```js
import { bootCoreModels, bootModelsFromViteGlob } from 'soukai-bis';

bootCoreModels();
bootModelsFromViteGlob(import.meta.glob('./models/*.ts', { eager: true }));
```

Files ending with `.schema` will be ignored, so you can keep your [schema definitions](../advanced/typescript.md) next to your models.

## Authentication

The library's scope is limited to interacting with the POD; it doesn't have any functionality to perform the initial authentication. Instead, it expects you to handle it with an external library (such as [Inrupt's Library](https://github.com/inrupt/solid-client-authn-js)), and provide an authenticated fetch to the `SolidEngine`:

```js
import { fetch } from '@inrupt/solid-client-authn-browser';
import { SolidEngine, setEngine } from 'soukai-bis';

setEngine(
    new SolidEngine({
        // Authenticated fetch, defaults to the global fetch.
        fetch,

        // Maximum number of concurrent requests, defaults to 10.
        concurrency: 5,
    }),
);
```

Once that's done, you'll be able to read and write models in the user's POD:

```js
await Person.createAt('https://alice.example.org/people/', { name: 'Bob' });
```

> [!WARNING]
> This example is illustrative to get you started. In a real application, you shouldn't hard-code container urls. Instead, you should discover them reading the user's profile and [type indexes](../advanced/interoperability.md#type-indexes).

## Namespace

Some engines need to persist data in shared browser storage, such as IndexedDB. By default, Soukai will use a database called `soukai`, but you can configure it using the `setNamespace` method. Make sure to call it before using any engines:

```js
import { setNamespace } from 'soukai-bis';

setNamespace('my-app');
```

# Configuration

In order to make good use of the library, you should be familiar with the [core concepts](../core-concepts/models.md). But TLDR, you'll need to set up 3 things: Models, an Engine, and probably Authentication.

## Models

Models are the main building blocks for your application.

You can define them using [Zod schemas](https://zod.dev/api):

::: code-group

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { number, string } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
        age: number().optional(),
    },
});
```

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

:::

Before using any models, you'll also need to [boot them](../core-concepts/models.md#booting-models) with `bootModels()`:

```ts
import { bootModels } from 'soukai-bis';

import User from './User';

bootModels({ User });
```

Learn more about this in the [Models documentation](../core-concepts/models.md).

## Engine

An engine determines where the data is actually stored.

You can configure the default behavior using the `setEngine` function:

```ts
// Store data in-memory
setEngine(new InMemoryEngine());

// Store data in IndexedDB
setEngine(new IndexedDBEngine());

// Store data in a Solid POD
setEngine(new SolidEngine({ fetch: authenticatedFetch }));
```

Every engine stores the same RDF documents, so you can use an in-memory engine for unit tests, an IndexedDB engine during development, and a Solid engine in production (or combine them for a [local-first app](../advanced/local-first.md)).

Learn more about this in the [Engines documentation](../core-concepts/engines.md).

## Authentication

This library's scope is limited to interacting with the POD; it doesn't have any functionality to perform the initial authentication. Instead, it expects you to handle it with an external library (such as [Inrupt's Library](https://github.com/inrupt/solid-client-authn-js)), and provide an authenticated fetch when you're using a `SolidEngine`:

```ts
import { fetch } from '@inrupt/solid-client-authn-browser';
import { SolidEngine, setEngine } from 'soukai-bis';

setEngine(new SolidEngine({ fetch }));
```

Once all of that is done, you'll be able to read and write models in a user's POD:

```ts
await User.createAt('https://alice.example.org/people/', { name: 'Bob' });
```

> [!WARNING]
> This example is illustrative to get you started. In a real application, you shouldn't hard-code container urls. Instead, you should discover them through the [type index](../advanced/interoperability.md#type-indexes).

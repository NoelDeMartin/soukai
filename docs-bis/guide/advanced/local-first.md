# Local-first

[Local-first](http://inkandswitch.com/local-first/) is a software architecture that puts data ownership and sovereignty at its center, and it's the perfect companion for Solid applications. Essentially, it's all about being able to use software completely offline, and having changes synchronize seamlessly in the background.

With Soukai, making a local-first application is very easy, because it provides a first-party CRDT (Conflict-Free Replicated Datatype) for working with Solid.

If you're interested in learning more about local-first and how it works with Solid, check out this presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/vYQmGeaQt8E?si=ZqZkScUuZa2I6GGV" title="Solid CRDTs in Practice" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In particular, these are some of the design decisions that guided Soukai's local-first approach:

- Support both local-first and standard Solid apps that rely on having a network connection, making CRDTs optional. This ensures that data remains interoperable with other apps.
- Each RDF resource represents its own CRDT history, instead of having a single CRDT graph for the entire POD.
- Follow a "Sync the world" strategy, all the data relevant to an application should be pulled into every device; not just the data that's visited. This means the app can be used completely offline after its initial Sync.

## History tracking

Local-first behavior is opted in by activating history tracking. You can enable it in the model schema:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    history: true,
    fields: {
        name: string(),
    },
});
```

Once this is enabled, any changes that are made to the model will create new operations using the built-in `operations` relation. This relation isn't loaded by default, if you want to inspect it you'll need to load it explicitly:

```ts
const alice = await Person.create({ name: 'Alice' });

await alice.update({ name: 'Alice Cooper' });

const operations = await alice.loadRelation('operations');

console.log(operations.length);
// console output: 2
```

Operations are stored in the same document as the model, so any device with access to the document can merge them. When a document is synchronized, the model attributes are updated with the result of applying all the operations.

## Synchronization

The typical setup for a local-first application is to store all the data in a local engine, and synchronize it with the user's Solid POD when they are online.

You can use the `Sync` service to manage the synchronization lifecycle.

::: details Lifecycle diagram

<img class="diagram light-only" src="/diagrams/sync-states.svg" alt="Sync states diagram">
<img class="diagram dark-only" src="/diagrams/sync-states-dark.svg" alt="Sync states diagram">

:::

### Configuration

First, you'll need to configure a local engine as the default, and boot the Sync service to manage the lifecycle in the background:

```ts
import { IndexedDBEngine, LocalStorageSyncStorageProvider, Sync, setEngine } from 'soukai-bis';

import Task from '@/models/Task';

setEngine(new IndexedDBEngine());

await Sync.boot({
    models: [{ model: Task, registration: true }],
    storageProvider: new LocalStorageSyncStorageProvider(),
});
```

Each model accepts the following options:

- `registration`: Registers the model in the user's type indexes, where its containers will be discovered from. It can also be an object with the following settings:
    - `path`: The path of the container, relative to the user's storage. Defaults to the [default container name](../core-concepts/models.md#containers) of the model.
    - `public`: Whether to register the container in the public type index (defaults to `false`, using the private type index).
    - `mode`: Use `'container'` (the default) to register the container where the models are stored, or `'instance'` to register each model individually.
- `files`: Files aren't synchronized by default, so you can use this option to sync files in the model's containers (`FilesSyncStrategies.Container`) or linked in some of its fields (`FilesSyncStrategies.Document`). Only their metadata is stored locally, unless you use the `availableOffline` option.

The `storageProvider` is where the service persists its state between sessions, such as whether the user has completed the [setup](#connecting-setup) and which containers are used by each model. You can use the built-in `LocalStorageSyncStorageProvider` to keep data in `localStorage`, or write your own by implementing the `SyncStorageProvider` interface.

### Connecting & Setup

Once the service is booted, users can start using your application without being logged in, and models will be created in local containers (for example, `local://tasks/`).

Once they log in, you can start a session connecting to their POD:

```ts
const session = await Sync.connect({ user: userProfile });
```

The first time users connect to a POD, the data they created before logging in still has local urls, so it can't be pushed as is. Before synchronizing, each local container needs to be mapped to a remote container in the user's POD, and all the local urls rewritten to match. This is what we call the setup.

You can trigger this process using the `setup()` method. Keep in mind that it won't upload anything to the POD, so you'll usually want to [synchronize](#synchronizing) right after:

```ts
await session.setup();
await session.synchronize();
```

If the user didn't create any data before connecting, there's nothing to rewrite, so the setup will be completed automatically when connecting. Otherwise, it's up to you to decide when to call it.

You can check whether the setup has been completed using `Sync.setupCompleted`.

### Synchronizing

Once the setup is completed, you can start the synchronization process:

```ts
await session.synchronize();
```

This will pull changes from the POD into the local engine, push local changes to the POD, and merge the CRDT operations of documents modified in both places. It will also register the containers of your models in the user's type indexes, if they aren't registered already.

### Disconnecting

When the user logs out, remember to disconnect:

```ts
await session.disconnect({ reset: true });
```

This will cancel any synchronization in progress, and the `reset` option will reset the sync state as if the setup had never been completed. Local data will be kept, so if a different user may log in next, you should also clear the local engine (for example, calling `clear()` on the `IndexedDBEngine`).

## Deletions

In a pure local-first approach, you wouldn't be able to delete documents, given that CRDT operations are supposed to be immutable. However, given the privacy concerns of Solid, this library allows you to delete models. In order to make sure that these are not re-created on sync, models with history tracking will leave a `crdt:Tombstone` behind:

```ts
await alice.delete(); // This will delete all data and operations from alice, and leave a crdt:Tombstone with the deletion date.
```

When the model is synchronized, its data is removed from the local engine right away, and the tombstone is written to the POD on the next synchronization. Models that were never pushed to the POD don't need a tombstone at all.

This behavior can be disabled by setting the `tombstone` option in the schema, but it's not recommended:

```ts
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    history: true,
    tombstone: false,
    fields: {
        name: string(),
    },
});
```

### Deletion conflicts

A model may be deleted in one place and modified in another. By default, the deletion wins, but you can decide what to do with the `resolveDeletionConflict` option, returning `'delete'` or `'restore'`:

```ts
await Sync.connect({
    // ...
    resolveDeletionConflict: async (conflict) => {
        return confirm(`${conflict.resourceUrl} has been deleted in another device, delete it here as well?`)
            ? 'delete'
            : 'restore';
    },
});
```

The `type` of the conflict will be `'deleted-remotely'` or `'deleted-locally'`, and the `model` property will hold the affected model, if it could be found.

### Soft deletes

If you'd rather keep the data around, models with history tracking and timestamps can also be soft deleted. This will store the deletion date in the model metadata, and create a `crdt:DeleteOperation` so that it is merged properly on sync:

```ts
await alice.softDelete();

console.log(alice.isSoftDeleted());
// console output: true
```

Soft deleted models will be ignored when using `find()`, `all()`, and loading relations. If you want to retrieve them, you can use the `includeSoftDeleted` option:

```ts
await Person.find(alice.url); // null
await Person.find(alice.url, { includeSoftDeleted: true }); // alice
await Person.all({ includeSoftDeleted: true }); // [alice, ...]
```

And they can be restored at any time, creating a `crdt:RestoreOperation`:

```ts
await alice.restore();
```

Keep in mind that calling `delete()` on a soft deleted model will still delete it permanently, and cascade deletes also include related models that have been soft deleted.

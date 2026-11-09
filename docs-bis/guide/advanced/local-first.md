# Local-first

Soukai implements a simple, yet powerful, CRDT (Conflict-Free Replicated Datatype) to build [local-first applications](http://inkandswitch.com/local-first/) using the Solid Protocol.

You can learn more about CRDTs and the design philosophy in this presentation (12 min):

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/vYQmGeaQt8E?si=ZqZkScUuZa2I6GGV" title="Solid CRDTs in Practice" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

These are the requirements that guided the implementation:

- Support both local-first and online usage.
- Make CRDTs optional for online usage.
- Each Resource should be its own CRDT (usually, that will mean each document).
- Support relations sync (E.g., Shows are registered in the type index, and their seasons and episodes also sync).
- Follow a "Sync the world" strategy, all changes should be pulled into each device.

## History tracking

In some situations, it is desirable to keep track of changes made to a model over time. That is the cornerstone of making local-first applications.

History tracking is disabled by default, but you can enable it in the model schema:

```ts [Person.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    history: true,
    fields: {
        name: string(),
    },
});
```

Once this is enabled, any changes that are made to the model will create new operations using the built-in `operations` relation. This relation isn't loaded by default, so you'll need to load it explicitly if you want to inspect it:

```ts
const alice = await Person.create({ name: 'Alice' });

await alice.update({ name: 'Alice Doe' });

const operations = await alice.loadRelation('operations');

console.log(operations.length);
// console output: 2
```

The code above will generate the following operations:

- Set `name` to "Alice"
- Set `name` to "Alice Doe"

### Merging operations

Operations are stored as RDF resources in the same document as the model, so they can be merged by any device that has access to the document. Once operations from different devices have been merged into a document, you can call the `syncOperations` method to update the model attributes with the result of applying all the operations:

```ts
await alice.syncOperations();
```

You won't need to do this manually in most cases, though, because it's done automatically when [synchronizing](#synchronization) models.

## Deletions

In a pure local-first approach, you wouldn't be able to delete documents, given that CRDT operations are supposed to be immutable. However, this library allows to delete models. In order to make sure that these are not re-created on sync, models with history tracking will leave a `crdt:Tombstone` behind:

```ts
await alice.delete(); // This will delete all data and operations from alice, and leave a crdt:Tombstone with the deletion date.
```

This behaviour can be disabled by setting the `tombstone` option in the schema, but it's not recommended:

```ts [Person.schema.ts]
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

::: warning TODO
Previous versions of Soukai supported soft-deleting models, using `softDelete()`, `isSoftDeleted()`, `useSoftDeletes()`, and `forceDelete()`. This hasn't been implemented yet.
:::

## Synchronization

The typical setup for a local-first application is to store all the data in a local engine (such as the `IndexedDBEngine`), and synchronize it with a Solid POD when the user is online. This can be done using the `Sync` job:

```ts
import { IndexedDBEngine, SolidEngine, Sync } from 'soukai-bis';

await Sync.run({
    userProfile,
    localEngine: new IndexedDBEngine(),
    remoteEngine: new SolidEngine({ fetch }),
    applicationModels: [
        { model: Task, registration: true },
        { model: Tag, registration: { path: 'tasks/tags', public: true } },
    ],
    onUpdated: (progress) => console.log(`Sync progress: ${progress * 100}%`),
});
```

This will pull changes from the POD into the local engine, push local changes to the POD, and merge the CRDT operations of documents modified in both places. It will also register the containers of your models in the user's type indexes, if they aren't registered already. The `registration` option of each model accepts the following settings:

- `path`: The path of the container, relative to the user's storage. Defaults to the [default container name](../core-concepts/models.md#containers) of the model.
- `public`: Whether to register the container in the public type index (defaults to `false`, using the private type index).
- `mode`: Use `'container'` (the default) to register the container where the models are stored, or `'instance'` to register each model individually.

### External sources

If you also need to synchronize data outside of the user's storage (for example, a container shared by someone else), you can use the `externalSources` option. These will be pulled and pushed like the rest, but they won't be registered in type indexes, and their errors won't count towards `maxErrors`:

```ts
await Sync.run({
    // ...
    externalSources: [
        { containerUrl: 'https://bob.example.org/shared-tasks/', models: [Task] },
        { instanceUrl: 'https://bob.example.org/tasks/groceries#it', models: [Task] },
    ],
    onExternalSourceFailed: (source, error) => console.error('Could not sync external source', source, error),
});
```

### Job configuration

There are also some other options to configure the job, such as `publicTypeIndexes`, `privateTypeIndexes`, `createPublicTypeIndex`, `createPrivateTypeIndex`, `concurrency`, `maxErrors`, and `lastModifiedTolerance`. And some other listeners, such as `onFinished`, `onCancelled`, `onModelsRegistered` and `onModelsRegistrationFailed`.

If you want more control over the job, you can also instantiate it manually. Every job exposes its `progress`, and it can be cancelled:

```ts
const sync = new Sync(config);

sync.listeners.add({ onUpdated: (progress) => console.log(progress) });

// Run the job...
sync.process();

// Later...
await sync.cancel();
```

### Migrating local urls

When users start using your application without being logged in, models will be created with local urls (for example, `local://tasks/...`). Once they log in, you can migrate these urls to their Solid POD using the `MigrateLocalUrls` job:

```ts
import { MigrateLocalUrls } from 'soukai-bis';

await MigrateLocalUrls.run({
    engine: localEngine,
    migrations: {
        'local://tasks/': 'https://alice.example.org/tasks/',
    },
});
```

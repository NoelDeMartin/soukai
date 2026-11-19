# Local-first

[Local-first](http://inkandswitch.com/local-first/) is a software architecture that puts data ownership and sovereignty at its center, and it's the perfect companion for Solid applications.

With Soukai, making a local-first application is very easy, because it provides a first-party CRDT (Conflict-Free Replicated Datatype) for working with Solid.

If you're interested in learning more about local-first and how it works with Solid, check out this presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/vYQmGeaQt8E?si=ZqZkScUuZa2I6GGV" title="Solid CRDTs in Practice" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

In particular, these are some of the design decisions that guided Soukai's local-first approach:

- Support both local-first and online usage, making CRDTs optional for online usage. This ensures that data remains interoperable with other apps.
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

Once this is enabled, any changes that are made to the model will create new operations using the built-in `operations` relation. This relation isn't loaded by default, so you'll need to load it explicitly if you want to inspect the changes:

```ts
const alice = await Person.create({ name: 'Alice' });

await alice.update({ name: 'Alice Cooper' });

const operations = await alice.loadRelation('operations');

console.log(operations.length);
// console output: 2
```

The code above will generate the following operations:

- Set `name` to "Alice"
- Set `name` to "Alice Cooper"

Operations are stored in the same document as the model, so any device with access to the document can merge them. When a document is [synchronized](#synchronization), the model attributes are updated with the result of applying all the operations (you can also do this manually calling `syncOperations()`).

## Deletions

In a pure local-first approach, you wouldn't be able to delete documents, given that CRDT operations are supposed to be immutable. However, given the privacy concerns of Solid, this library allows you to delete models. In order to make sure that these are not re-created on sync, models with history tracking will leave a `crdt:Tombstone` behind:

```ts
await alice.delete(); // This will delete all data and operations from alice, and leave a crdt:Tombstone with the deletion date.
```

If the model [tracks local changes](#tracking-local-changes), its data is removed from the local engine right away and the deletion is recorded, so that the tombstone is written to the POD on the next sync instead. Models that were never pushed to the POD don't need a tombstone at all.

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

## Synchronization

The typical setup for a local-first application is to store all the data in a local engine (such as the `IndexedDBEngine`), and synchronize it with a Solid POD when the user is online. This can be done using the `Sync` job, which uses the default engine as the local engine (so it must be a local engine, such as the `IndexedDBEngine` or the `InMemoryEngine`) and the [remote engine](../core-concepts/engines.md#remote-engine) to reach the POD:

```ts
import { IndexedDBEngine, SolidEngine, Sync, setEngine, setRemoteEngine, trackLocalChanges } from 'soukai-bis';

setEngine(new IndexedDBEngine());
setRemoteEngine(new SolidEngine({ fetch }));
trackLocalChanges(Task);
trackLocalChanges(Tag);

await Sync.run({
    userProfile,
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

### Tracking local changes

`Sync` only pushes the changes recorded by the local engine, and these are only recorded for models that call `trackLocalChanges()`. Changes to other models will stay in the local engine.

Make sure to call it for every synced model when the application boots, before any data is created. Otherwise, models created before calling it (for example, while the user isn't logged in) won't be pushed once they log in.

Tracked models without [history tracking](#history-tracking) can only be created and deleted, because their updates couldn't be merged with changes from other devices. Trying to update one will throw an error.

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
    migrations: {
        'local://tasks/': 'https://alice.example.org/tasks/',
    },
});
```

If during login you've also detected a user preference to use some different [RDF prefixes](./interoperability.md#rdf-prefix-aliases), you can also use the `prefixes` option to replace them in the existing data:

```ts
import { MigrateLocalUrls, Sync, replaceRDFPrefixes } from 'soukai-bis';

replaceRDFPrefixes({ 'https://schema.org/': 'http://schema.org/' });

await MigrateLocalUrls.run({
    migrations: {
        'local://tasks/': 'https://alice.example.org/tasks/',
    },
    prefixes: {
        'https://schema.org/': 'http://schema.org/',
    },
});
```

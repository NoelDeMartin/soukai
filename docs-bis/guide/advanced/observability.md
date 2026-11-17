# Observability

You can register listeners for model lifecycle events using the static `on` method:

```ts
User.on('created', ({ model }) => console.log(`Created ${model.name} user.`));
User.on('modified', ({ model, field }) => console.log(`Modified ${model.name} user (${field}).`));
User.on('updated', ({ model }) => console.log(`Updated ${model.name} user.`));
User.on('deleted', ({ model }) => console.log(`Deleted ${model.name} user.`));

const user = await User.create({ name: 'John' });
// console output: Created John user.

user.name = 'Jane';
// console output: Modified Jane user (name).

await user.save();
// console output: Updated Jane user.

await user.delete();
// console output: Deleted Jane user.
```

This method returns a function that you can call to unsubscribe the listener. Alternatively, you can also pass the event and the listener to the `off` method, or use `'*'` to unsubscribe the listener from all the events it was registered for. You can also use `once` for callbacks that only need to be called a single time.

```ts
function logUpdate({ model }) {
    console.log(`Updated ${model.name} user.`);
}

User.on('created', logUpdate);
User.on('updated', logUpdate);
User.once('updated', logUpdate); // Only called once

// Later...
User.off('created', logUpdate); // Stops listening to created events.
User.off('*', logUpdate); // Stops listening to all events.
```

Listeners can be asynchronous, and operations will wait for them to finish. For example, `await user.save()` won't resolve until all the `created`, `updated`, and `saved` listeners are done. The only exception is `modified`, which is emitted synchronously when an attribute is set, so it isn't awaited.

## Events

There are two kinds of events:

- **Instance events** are emitted by model instances, and their payload includes the `model` that emitted them. Most events are instance events, such as `created` or `modified`.
- **Class events** are emitted by model classes, and their payload includes the `modelClass` that emitted them. For example, `schema-updated` is emitted when calling `Task.updateSchema()`.

These are all the events that you can listen to:

| Event             | Kind     | Payload                  | Description                                                            |
| ----------------- | -------- | ------------------------ | ---------------------------------------------------------------------- |
| `created`         | Instance | `{ model }`              | A new model has been saved for the first time.                         |
| `updated`         | Instance | `{ model }`              | An existing model has been saved.                                      |
| `saved`           | Instance | `{ model }`              | A model has been saved (emitted after `created` or `updated`).         |
| `deleted`         | Instance | `{ model }`              | A model has been deleted.                                              |
| `modified`        | Instance | `{ model, field }`       | An attribute has been modified (but not saved yet).                    |
| `relation-loaded` | Instance | `{ model, relation }`    | A relation has been loaded with `loadRelation` or `setRelationModels`. |
| `schema-updated`  | Class    | `{ modelClass, schema }` | The schema has been changed with `updateSchema`.                       |

## Instance listeners

Listeners can also be registered on model instances, in which case they'll only be called for instance events emitted by that instance. They receive the same payload as static listeners:

```ts
const stopListening = user.on('modified', ({ field }) => console.log(`Modified ${field}.`));

// Later...
stopListening();
```

Instance listeners can also be removed with `off`, which only affects the listeners registered on that instance:

```ts
user.on('updated', logUpdate);

// Later...
user.off('updated', logUpdate);
```

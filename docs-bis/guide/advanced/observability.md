# Observability

You can register listeners related with model lifecycle events using the static `on` method:

```js
User.on('created', (user) => console.log(`Created ${user.name} user.`));
User.on('modified', (user, field) => console.log(`Modified ${user.name} user (${field}).`));
User.on('updated', (user) => console.log(`Updated ${user.name} user.`));
User.on('deleted', (user) => console.log(`Deleted ${user.name} user.`));

const user = await User.create({ name: 'John' });
// console output: Created John user.

user.name = 'Jane';
// console output: Modified Jane user (name).

await user.save();
// console output: Updated Jane user.

await user.delete();
// console output: Deleted Jane user.
```

These are all the events that you can listen to:

| Event             | Payload                 | Description                                                |
| ----------------- | ----------------------- | ---------------------------------------------------------- |
| `created`         | -                       | A new model has been saved for the first time.             |
| `updated`         | -                       | An existing model has been saved.                          |
| `saved`           | -                       | A model has been saved (emitted after created or updated). |
| `deleted`         | -                       | A model has been deleted.                                  |
| `modified`        | The name of the field   | An attribute has been modified (but not saved yet).        |
| `relation-loaded` | The `Relation` instance | A relationship has been loaded calling `loadRelation`.     |

The `on` method returns a function that you can call to remove the listener. You can also use the `once` method to listen to an event only once.

Listeners can also be registered on model instances, in which case the model won't be passed as the first argument:

```js
const stopListening = user.on('modified', (field) => console.log(`Modified ${field}.`));

// Later...
stopListening();
```

::: warning TODO
Previous versions of Soukai also emitted a `schema-updated` event when the schema of a model was changed at runtime. This hasn't been implemented yet (see [Interoperability](./interoperability.md#model-schemas)).
:::

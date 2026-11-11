# Engines

Once you have defined your Models, you'll want to store them _somewhere_. In order to configure where the data ends up, you'll use different Engines.

You can set a default global engine calling the `setEngine` method:

```ts
setEngine(new InMemoryEngine());
```

If you want an easy way to learn how the library behaves, you can start using the `InMemoryEngine` and inspect the `documents` property, which is just a plain JavaScript object with the documents' RDF (the same data that will be used to persist with other engines):

```ts
const engine = new InMemoryEngine();

setEngine(engine);

await User.create({ name: 'John Doe' });

// Inspect the database
console.log(engine.documents);
```

These are the engines that come built-in:

- `SolidEngine`: Stores data in a Solid POD. You can learn how to configure it in the [Configuration](../getting-started/configuration.md#authentication) section.
- `IndexedDBEngine`: Stores data in IndexedDB.
- `InMemoryEngine`: Stores data in memory.

Regardless of the engine you use, data is always stored as RDF documents. This means that you can move data from one engine to another without any transformation, which is what makes [local-first](../advanced/local-first.md) applications possible.

## Creating

Once you've defined your Models and configured an Engine, you have a couple of options to write into the storage.

First, you can create a new Model instance and call the `save` method:

```ts
const user = new User({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});

await user.save();
```

You can also achieve the same result in a single call using the static `create` method (or `createAt`, if you want to indicate the container):

```ts
await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});
```

## Updating

For persisting model updates, you also have a couple of options.

You can update the Model attributes as usual, and call the `save` method to persist changes:

```ts
user.name = 'Jane';
// or...
user.setAttribute('name', 'Jane');

await user.save();
```

Or you can use the `update` single liner to both update the model and persist the changes:

```ts
await user.update({ name: 'Jane' });
```

> [!WARNING] ⚠️ Beware of concurrent updates
> Saving a model that changed in the storage after your last synchronization may not work as expected, because the internal state may differ. Specially if you're not [enabling local-first](../advanced/local-first.md).
>
> Also, depending on the engine you're using, calling the `save` method multiple times on the same model may fail due to race conditions. Make sure to debounce the calls so that you don't have multiple operations going on concurrently.

## Reading

Once you have written some data in your storage, you can retrieve single models by url using the `find` method (or `findOrFail`, if you want to throw an error when the model doesn't exist):

```ts
const user = await User.find('https://example.org/users/john#it');

console.log('User with url "https://example.org/users/john#it"', user);
```

You can also get multiple instances with the `all` method:

```ts
const users = await User.all();

console.log('All users', users);
```

By default, this will read models from the [default container](./models.md#containers), but you can read them from other containers using the `from` option. It's also possible to read models from nested containers using the `deep` or `depth` options:

```ts
const users = await User.all({ from: 'https://example.org/users/', depth: 2 });

console.log('Users in container (and nested 2 levels)', users);
```

If any of the documents fails to be parsed, the method will throw an error. But you can use the `onDocumentError` option to handle these errors and continue reading the other documents.

## Deleting

Finally, when you need to delete data, you can use the `delete` method:

```ts
await user.delete();
```

If the model is the only resource in its document, the document will be deleted. Otherwise, only the resources related with the model will be removed from the document.

### Marking models for deletion

Instead of deleting a model right away, you can also mark it for deletion using the `markForDeletion` method. The model will be deleted the next time it's saved:

```ts
user.markForDeletion();

// The model will be deleted from the engine at this point.
await user.save();
```

You can check whether a model has been marked for deletion with `isMarkedForDeletion`, and undo it with `unmarkForDeletion`.

## Remote engine

Some models can only be used against a Solid POD, such as `TypeIndex`, `TypeRegistration`, or the models used to manage [permissions](../advanced/authorization.md). These are _remote_ models, and they always use a remote engine rather than the default one. The same applies to any other operation that needs to reach the POD, like reading or updating permissions.

If your default engine is a `SolidEngine`, it'll be used as the remote engine as well and you don't have to worry about it. However, if your default engine doesn't work against a Solid POD, you'll need to configure the remote engine with `setRemoteEngine`:

```ts
setEngine(new IndexedDBEngine());
setRemoteEngine(new SolidEngine({ fetch }));
```

If you need to work with models that shouldn't be stored locally, you can also declare them as remote with `static remote = true`, or get a remote version of an existing model with the `remote` helper:

```ts
const RemoteContainer = remote(Container);

await RemoteContainer.create({ url: 'https://alice.example.org/tasks/', name: 'Tasks' });
```

This will create a subclass of the model booted as `RemoteContainer`, and calling it again with the same model will return the same class.

You can learn more about this in the [local-first](../advanced/local-first.md) section.

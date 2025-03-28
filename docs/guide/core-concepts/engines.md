# Engines

Once you have defined your data with Models, you'll want to store it _somewhere_. In order to configure where the data ends up, you'll use Engines.

You can set the default engine calling the `setEngine` method:

```js
setEngine(new InMemoryEngine());
```

If you're interested in learning how the library behaves, you can start using the `InMemoryEngine` and inspect the `database` property which is just a plain JavaScript object:

```js
const engine = new InMemoryEngine();

setEngine(engine);

await User.create({ name: 'John Doe' });

// Inspect the database
console.log(engine.database);
```

There are some of the engines built-in:

- `InMemoryEngine`: Stores data in memory.
- `LogEngine`: Delegates all the operations to an underlying engine, but prints logs to the console.
- `IndexedDBEngine`: Stores data in IndexedDB.
- `LocalStoreEngine`: Stores data in localStorage.
- `FakeEngine`: Similar to `InMemoryEngine`, but it also exposes some testing helpers. You'll need to import it from `soukai/testing`.

## Storing data

Once you've defined your Models and configured an Engine, you have a couple of options to store your data.

First, you can create a new Model instance and call the `save` method:

```js
const user = new User({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});

await user.save();
```

You can also achieve the same result in a single line using the static `create` method:

```js
await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});
```

For persisting model updates, you also have a couple of options.

You can update the Model attributes as usual, and call the `save` method to persist changes:

```js
user.name = 'Jane';
// or...
user.setAttribute('name', 'Jane');

await user.save();
```

Or you can use the `update` single liner to both update the model and persist the changes:

```js
await user.update({ name: 'Jane' });
```

> [!WARNING] ⚠️ Beware of concurrent updates
> Saving a model that was updated remotely after your last synchronization may not work as expected because the internal state may differ. Also, depending on the engine you're using, calling the `save` method multiple times on the same model may fail due to race conditions. Make sure to debounce the calls so that you don't have multiple operations going on concurrently.

## Fetching data

Once you have written some data in your storage, you can retrieve single models using the `find` method:

```js
const user = await User.find('1');

console.log('User with id "1"', user);
```

You can also get multiple instances with the `all` method:

```js
const users = await User.all();

console.log('All users', users);
```

### Using filters

When retrieving models, it's common to use filters to retrieve a reduced amount of models instead of getting the whole collection. There are currently two types of filters available: the `$in` filter and field filters.

The `$in` filter defines an array of ids with the models to retrieve:

```js
const users = await User.all({ $in: ['1', '2', '3'] });

console.log('Users with id "1", "2" and "3"', users);
```

An alternative is to filter results by fields, indicating the attribute values:

```js
const users = await User.all({ name: 'John' });

console.log('Users with name "John"', users);
```

The `$in` filter can also be used with individual fields:

```js
const users = await User.all({ name: { $in: ['John', 'Amy'] } });

console.log('Users with name "John" or "Amy"', users);
```

And there are also some special operators to perform advanced filters:

- The `$contains` operator can be used to perform partial matches in array fields:

    ```js
    const users = await User.all({
        hobbies: { $contains: ['hiking', 'surfing'] },
    });

    console.log('Users whose hobbies contain "hiking" and "surfing"', users);
    ```

- The `$or` operator can be used to search documents that match one of multiple conditions. This can be used in root filters combined with `$eq`, the implicit operator:

    ```js
    const users = await User.all({
        role: {
            $or: [{ $eq: 'developer' }, { $eq: 'designer' }],
        },
    });

    console.log('Users who have a "developer" or "designer" role', users);
    ```

## Deleting data

Finally, when you need to delete data, you can use the `delete` method:

```js
await user.delete();
```

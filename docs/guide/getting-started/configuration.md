# Configuration

In order to take full advantage of the library, you should be familiar with the [Core concepts](/guide/core-concepts/models.html).

But TLDR, Soukai implements the [Active Record](https://en.wikipedia.org/wiki/Active_record_pattern) pattern. It allows you to declare your data schema using an Object Oriented approach by extending the `Model` class, and you can configure how it'll be persisted using different Engines.

You can declare schema validations right on the model classes:

```js
class User {
    static fields = {
        name: FieldType.String,
        age: FieldType.Number,
    };
}
```

And you can configure where the data is stored using the `setEngine` method:

```js
// Store data in-memory
setEngine(new InMemoryEngine());

// Store data in IndexedDB
setEngine(new IndexedDBEngine());

// Log engine interactions
setEngine(new LogEngine(IndexedDBEngine()));

// ...
```

## Using Solid

If you want to take advantage of the [Solid Protocol](/guide/solid-protocol/what-is-solid), you'll need to install the `soukai-solid` package:

```sh
npm install soukai-solid --save
```

Additionally, you'll need to call the `bootSolidModels()` and extend from the `SolidModel` class.

With that, you'll be able to use the `SolidEngine`:

```js
class Person extends SolidModel {}

bootSolidModels();
setEngine(new SolidEngine());

Person.at('https://example.org/people/').create({ name: 'Alice' });
```

> [!WARNING]
> This example is illustrative to get you started. In a real application you would need to declare the model schema, pass an authenticated fetch to the `SolidEngine` constructor, and the provide the container url dynamically.

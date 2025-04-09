# History Tracking

> [!Note]
> This is functionality is limited to applications using the [Solid Protocol](../solid-protocol/what-is-solid.md).

In some situations, it is desirable to keep track of changes made to a model over time. That is the cornerstone of making [local-first applications](http://inkandswitch.com/local-first/).

History tracking is disabled by default, but you can enable it in the model declaration:

```js
class Person extends SolidModel {
    static history = true;
}
```

Once this is enabled, any changes that are made to the model will create new operations using the built-in `operations` relationship:

```js
const alice = await Person.create({ name: 'Alice' });

await alice.update({ name: 'Alice Doe' });

console.log(alice.operations.length);
// console output: 2
```

The code above will generate the following operations:

- Set `name` to "Alice"
- Set `name` to "Alice Doe"

This is a trivial example, but this allows implementing a crude [CRDT](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) mechanism that uses the Solid POD as mediator. This can be demonstrated by creating two instances of a model, updating them separately, and synchronizing them afterwards using the `synchronize` method:

```js
// Create two divergent models.
const original = await Person.create({ name: 'Peter Parker', alias: 'Spider-Man' });
const divergent = original.clone({ clean: true });

// Update them independently.
await original.update({ alias: 'The Amazing Spider-Man' });
await divergent.update({ name: 'Miles Morales' });

// Synchronize updates.
await SolidModel.synchronize(original, divergent);

// Both are now "Miles Morales - The Amazing Spider-Man". 🤔
console.log(original.getAttributes());
console.log(divergent.getAttributes());
```

There are also other use-cases supported, such as soft-deletes (marking a resource as deleted even though it still exists), and tombstones (leaving a `crdt:Tombstone` resource behind instead of deleting the entire document).

If you want to learn more about CRDTs in Solid, check out the following presentation:

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/vYQmGeaQt8E?si=ZqZkScUuZa2I6GGV" title="Solid CRDTs in Practice" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

# Observability

You can register listeners related with model lifecycle events using the `on` method:

```js
User.on('created', (user) => console.log(`Created ${user.name} user.`));
User.on('modified', (user) => console.log(`Modified ${user.name} user.`));
User.on('updated', (user) => console.log(`Updated ${user.name} user.`));
User.on('deleted', (user) => console.log(`Deleted ${user.name} user.`));

const user = await User.create({ name: 'John' });
// console output: Created John user.

user.name = 'Jane';
// console output: Modified Jane user.

await user.save();
// console output: Updated Jane user.

await user.delete();
// console output: Deleted Jane user.
```

You can also listen to other events such as `'relation-loaded'` or `'schema-updated'` (only when using a `SolidModel`).

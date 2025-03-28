# Observability

You can register listeners related with model lifecycle using the `on` method:

```js
User.on('created', (user) => console.log(`Created ${user.name} user.`));
User.on('updated', (user) => console.log(`Updated ${user.name} user.`));
User.on('deleted', (user) => console.log(`Deleted ${user.name} user.`));

const user = await User.create({ name: 'John' });
// console output: Created John user.

await user.update({ name: 'Jane' });
// console output: Updated Jane user.

await user.delete();
// console output: Deleted Jane user.
```

# Installation

With Soukai, you'll be able to create and store JavaScript objects with multiple storages: local storage, a database, or even a decentralized storage.

To get started, add the core package as an npm dependency:

```sh
npm install soukai --save
```

Once that's done, you'll need to configure the storage and your data models. Let's make sure that everything is working correctly with an in-memory storage:

```js
// Configure your data models and storage.
class User extends Model {}

setEngine(new InMemoryEngine());

// Write.
await User.create({ name: 'John', surname: 'Doe' });

// Read.
const users = await User.all();

console.log(
    'user models',
    users.map((user) => user.getAttributes())
);
```

And that's it! If you can see the console log showing up, that means you're ready to start working with Soukai.

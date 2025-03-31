# Hello World

If you followed the [installation instructions](../getting-started/installation.md), you've already seen the simplest possible example!

In any case, here it is again:

```js
import { InMemoryEngine, Model, setEngine } from 'soukai';

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

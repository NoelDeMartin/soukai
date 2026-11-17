# Hello World

If you followed the [installation instructions](../getting-started/installation.md), you've already seen the simplest possible example!

In any case, here it is again:

::: code-group

```ts [main.ts]
import { InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import User from './User';

// Configure your data models and storage.
bootCoreModels();
bootModels({ User });
setEngine(new InMemoryEngine());

// Write.
await User.create({ name: 'John', surname: 'Doe' });

// Read.
const users = await User.all();

console.log(
    'user models',
    users.map((user) => user.getAttributes()),
);
```

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
        surname: string(),
    },
});
```

:::

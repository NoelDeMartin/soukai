# Installation

To get started, install `soukai-bis` and `zod` using your favorite package manager:

```sh
pnpm add soukai-bis zod
```

Once that's done, you'll need to configure the storage and your data models. Before connecting to a POD, let's make sure that everything is working correctly with an in-memory storage:

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

And that's it! If you can see the console log showing up, that means you're ready to start working with Soukai. Head over to the [Configuration](./configuration.md) section to learn how to connect to a Solid POD.

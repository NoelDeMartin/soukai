# Hello World (using Solid)

The simplest possible example using Solid is very similar to the standard Hello World. But there are a couple of things to keep in mind:

- It's a good idea to declare RDF classes and properties explicitly, so that your data can be understood by other applications.
- You'll need to use an authentication library to be able to read and write private documents.

We are not going to discuss the second point here, but here's a simple example you can use to read public profiles:

::: code-group

```ts [main.ts]
import 'soukai-bis/patch-zod';
import { SolidEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import User from './User';

// Configure your data models and storage.
bootCoreModels();
bootModels({ User });
setEngine(new SolidEngine());

// Read profile.
const webId = 'https://noeldemartin.solidcommunity.net/profile/card#me';
const user = await User.findOrFail(webId);

console.log('user', user.getAttributes());
```

```ts [User.ts]
import Model from './User.schema';

export default class User extends Model {}
```

```ts [User.schema.ts]
import { defineSchema } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
    },
});
```

:::

> [!TIP]
> If you're working with user profiles, you can also use the built-in `Person` model. You can learn more about it in the [Interoperability](../advanced/interoperability.md#type-indexes) section.

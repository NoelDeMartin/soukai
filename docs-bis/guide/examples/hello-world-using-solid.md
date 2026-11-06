# Hello World (using Solid)

The simplest possible example using Solid is very similar to the normal Hello World. But there are a couple of things to keep in mind:

- It's a good idea to declare RDF classes and properties explicitly, so that your data can be understood by other applications.
- You'll need to use an authentication library to be able to read and write private documents.

We are not going to discuss the second point here, but here's a simple example you can use to read public profiles:

```js
import 'soukai-bis/patch-zod';
import { SolidEngine, bootCoreModels, bootModels, defineSchema, setEngine } from 'soukai-bis';
import { string } from 'zod';

// Configure your data models and storage.
class User extends defineSchema({
    rdfContext: 'http://xmlns.com/foaf/0.1/',
    rdfClass: 'Person',
    fields: {
        name: string(),
    },
}) {}

bootCoreModels();
bootModels({ User });
setEngine(new SolidEngine());

// Read profile.
const webId = 'https://noeldemartin.solidcommunity.net/profile/card#me';
const user = await User.find(webId);

console.log('user', user.getAttributes());
```

> [!TIP]
> If you're working with user profiles, you can also use the built-in `Person` model. You can learn more about it in the [Interoperability](../advanced/interoperability.md#type-indexes) section.

# Installation

With Soukai, you'll be able to read and write data in [Solid PODs](../solid-protocol/what-is-solid.md) using plain JavaScript objects.

Under the hood, all data is modeled as RDF. You can also store models locally (in memory, or in the browser using IndexedDB), and they will look exactly the same as in a POD. This means that you'll be able to move them from one storage to another without any transformation.

To get started, add the package as an npm dependency. You'll also need to install [Zod](https://zod.dev), which is used to declare model schemas:

```sh
npm install soukai-bis zod --save
```

Once that's done, you'll need to configure the storage and your data models. Before connecting to a POD, let's make sure that everything is working correctly with an in-memory storage:

```js
import 'soukai-bis/patch-zod';
import { InMemoryEngine, bootCoreModels, bootModels, defineSchema, setEngine } from 'soukai-bis';
import { string } from 'zod';

// Configure your data models and storage.
class User extends defineSchema({
    fields: {
        name: string(),
        surname: string(),
    },
}) {}

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

And that's it! If you can see the console log showing up, that means you're ready to start working with Soukai. Head over to the [Configuration](./configuration.md) section to learn how to connect to a Solid POD.

> [!NOTE] What's `soukai-bis/patch-zod`?
> Soukai extends Zod with some methods to declare RDF metadata in your schemas (such as `.rdfProperty()` or `.useAsSlug()`). The `soukai-bis/patch-zod` import installs these extensions, so make sure that it runs once before any of your models are declared (for example, at the top of your application's entry point).

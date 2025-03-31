# Hello World (using Solid)

The simplest possible example using Solid is very similar to the normal Hello World. But there are a couple of things to keep in mind:

- It's not a good idea to use Solid Models without strict field definitions.
- You'll need to use an authentication library be able to read and write private documents.

We are not going to discuss the second point here, but here's a simple example you can use to read public profiles:

```js
import { FieldType, setEngine } from 'soukai';
import { SolidModel, SolidEngine, bootSolidModels } from 'soukai-solid';

// Configure your data models and storage.
class User extends SolidModel {
    static rdfContext = 'http://xmlns.com/foaf/0.1/';
    static rdfsClass = 'Person';
    static fields = {
        name: FieldType.String,
    };
}

setEngine(new SolidEngine());

await bootSolidModels();

// Read profile.
const webId = 'https://noeldemartin.solidcommunity.net/profile/card#me';
const user = await User.find(webId);

console.log('user', user.getAttributes());
```

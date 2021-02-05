# Engines

Communication with the database is abstracted and can be adapted to multiple environments implementing the [Engine](https://soukai.js.org/api/interfaces/engines.engine.html) interface.

Depending on the scenario, this engine can send queries to a database (for example, a MongoDB engine in a server side application) or it can be a wrapper doing http requests (for example, in a client side application calling the backend API).

Given the possibilities, this library only provides some all-purpose implementations. Engines for specific use cases can be found in separated packages.

If you are looking for engines defined outside of the core, or you want to develop your own, you're encouraged to use the [#soukai](https://github.com/topics/soukai) and [#soukai-engine](https://github.com/topics/soukai-engine) topics in GitHub and elsewhere.

## Tinkering

The [InMemoryEngine](https://soukai.js.org/api/classes/engines.inmemoryengine.html) is intended as a development tool to get started quickly and can also be used to test applications without hitting a real database.

This engine exposes the memory object where the data is stored and can be accessed with the `database` property.

One example of using this engine is what you already saw in the getting started section:

```javascript
import Soukai, { Model, InMemoryEngine } from 'soukai';

class User extends Model {}

const engine = new InMemoryEngine();

Soukai.loadModel('User', User);
Soukai.useEngine(engine);

User.create({ name: 'John', surname: 'Doe' }).then(() => {
    console.log(engine.database);
});
```

This script would show an object with following structure in the console:

```json
{
    "users": {
        "{id}": {
            "id": "{id}",
            "name": "John",
            "surname": "Doe",
            "createdAt": "{date object}",
            "updatedAt": "{date object}"
        }
    }
}
```

## Debugging

When debugging applications that use this library, it is useful to be aware of what's happening under the hood with database communication.

The [LogEngine](https://soukai.js.org/api/classes/engines.logengine.html) can be used to wrap an existing engine and log to console all operations.

Using the same example as before:

```javascript
import Soukai, { Model, LogEngine, InMemoryEngine } from 'soukai';

class User extends Model {}

const engine = new InMemoryEngine();

Soukai.loadModel('User', User);
Soukai.useEngine(new LogEngine(engine));

User.create({ name: 'John', surname: 'Doe' });
```

This script would log the following information to console:

```
CREATE 'users' { name: 'John', surname: 'Doe' } undefined
CREATED '1'
```

## Other engines

To learn more about other engines, be sure to check out the ones [included in the core library](https://github.com/NoelDeMartin/soukai/tree/main/src/engines) and the [#soukai](https://github.com/topics/soukai) and [#soukai-engine](https://github.com/topics/soukai-engine) topics in GitHub and elsewhere.

# Getting Started


This library aims to provide an easy way to manage non-relational database objects in Javascript using an Object Oriented approach (hence ODM - Object Document Mapper). It provides a system to define database entities using [models](/guide/defining-models.html) and delegates the communication with the database to [engines](/guide/engines.html) in a customizable way.

To get started, add the package as an npm dependency:

```bash
npm install soukai --save
```

Initialize the library with the engine of your choice. One good option to start tinkering is an [InMemoryEngine](https://soukai.js.org/api/classes/InMemoryEngine), which will only store information in memory.

```javascript
import Soukai, { InMemoryEngine } from 'soukai';

Soukai.useEngine(new InMemoryEngine());
```

Once everything is set up, you can start using models to interact with the database. Look at the following example on creating and retrieving users:

```javascript
import Soukai, { Model, InMemoryEngine } from 'soukai';

class User extends Model {}

Soukai.loadModel('User', User);
Soukai.useEngine(new InMemoryEngine());

User.create({ name: 'John', surname: 'Doe' })
  .then(() => User.all())
  .then(models => models.map(model => model.getAttributes()))
  .then(users => console.log('user models', users));
```
<details>
  <summary>Try it yourself!</summary>
  <br>
  <iframe src="https://codesandbox.io/embed/soukaihelloworld-1eqtg?autoresize=1&expanddevtools=1&fontsize=14" title="soukai-hello-world" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>
</details>

Note how all operations interacting with the database return a Promise. This, coupled with the fact that the actual communication is implemented using engines, makes the library available both for client side and server side applications.

This project is heavily influenced by [Laravel Eloquent ORM](https://laravel.com/docs/5.8/eloquent), the two main differences being that Laravel is implemented in PHP and intended for relational databases (hence ORM - Object Relational Mapper). If you are already familiar with Laravel it should be easy to get started with Soukai, but it's recommended to skim through the documentation anyways to be aware of the differences.

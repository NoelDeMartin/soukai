---
sidebar: auto
---

# Guide

## Getting Started

This library aims to provide an easy way to handle non-relational database objects in Javascript using an Object Oriented approach (hence ODM - Object Document Mapper). It provides a system to define database entities using [models](#models) and delegates the communication with the database to [engines](#engines) in a customizable way.

To get started, add the package as an npm dependency:

```bash
npm install soukai --save
```

And initialize the library with the engine of your choice. One good option to start tinkering is an [InMemoryEngine](api.html#inmemoryengine), which will only store information in memory.

```javascript
import Soukai, { InMemoryEngine } from 'soukai';

Soukai.useEngine(new InMemoryEngine());
```

Once everything is set up, you can start using models to interact with the database. Look at the following example on creating and retrieving Users:

```javascript
import { Model } from 'soukai';

class User extends Model {
}

User.create({ name: 'John', surname: 'Doe' })
    .then(() => console.log(User.all()));

// This should show an array with the User "John Doe" in the console
```

Note how all operations interacting with the database return a Promise. This, coupled with the fact that the actual communication is implemented in the engine, makes the library an option both for client side and server side applications. If you are using Javascript in both scenarios, this should make your life easier!

## Performing CRUD operations

This project is heavily influenced by [Laravel Eloquent ORM](https://laravel.com/docs/5.6/eloquent), the two main differences being that Laravel is implemented in PHP and intended for relational databases (hence ORM - Object Relational Mapper).

TODO

## Models

TODO

## Engines

TODO

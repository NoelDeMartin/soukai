# Using Models

## Creating

In order to create models, there are two approaches. The first one is to create a new instance using the constructor and calling the [save](https://soukai.js.org/api/classes/models.model.html#save) method:

```javascript
const user = new User({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});

await user.save();

console.log('User saved', user);
```

The same operation can be performed using [Model.create](https://soukai.js.org/api/classes/models.model.html#create):

```javascript
const user = await User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});

console.log('User created', user);
```

## Reading

Single models can be retrieved using the [Model.find](https://soukai.js.org/api/classes/models.model.html#find) method using their id:

```javascript
const user = await User.find('1');

console.log('User with id "1"', user);
```

And multiple models can be retrieved using the [Model.all](https://soukai.js.org/api/classes/models.model.html#all) method:

```javascript
const users = await User.all();

console.log('All users', users);
```

### Using filters

When retrieving models, it's common to use filters to retrieve a reduced amount of models instead of getting the whole collection. There are currently two types of filters available: the `$in` filter and field filters.

The `$in` filter defines an array of ids with the models to retrieve:

```javascript
const users = await User.all({ $in: ['1', '2', '3'] });

console.log('Users with id "1", "2" and "3"', users);
```

An alternative is to filter results by fields, indicating the attribute values:

```javascript
const users = await User.all({ name: 'John' });

console.log('Users with name "John"', users);
```

The `$in` filter can also be used with individual fields:

```javascript
const users = await User.all({ name: { $in: ['John', 'Amy'] } });

console.log('Users with name "John" or "Amy"', users);
```

There is also some special operators to perform advanced filters.

The `$contains` operator can be used to perform partial matches in array fields:

```javascript
const users = await User.all({
    hobbies: { $contains: ['hiking', 'surfing'] },
});

console.log('Users whose hobbies array contains "hiking" and "surfing"', users);
```

The `$or` operator can be used to search documents that match one of multiple conditions. This can be used in root filters combined with `$eq`, the implicit operator:

```javascript
const users = await User.all({
    role: {
        $or: [
            { $eq: 'developer' },
            { $eq: 'designer' },
        ],
    },
});

console.log('Users who have a "developer" or "designer" role', users);
```

::: warning ⚠️ Advanced filters and pagination
This library is still a work in progress, so the current implementation does not support a way to paginate results or use advanced filters such as text search.
:::

## Updating

Like creating, updating also provides two alternatives to update models. It is possible to update attributes of an existing model (using setters or the [setAttribute](https://soukai.js.org/api/classes/models.model.html#setattribute) method) and call [save](https://soukai.js.org/api/classes/models.model.html#save) method:

```javascript
user.name = 'Jane';
// or...
user.setAttribute('name', 'Jane');

await user.save();

console.log('User updated', user);
```

Or using the [update](https://soukai.js.org/api/classes/models.model.html#update) method:

```javascript
await user.update({ name: 'Jane' });

console.log('User updated', user);
```

## Deleting

Models can be deleted from the database using the [delete](https://soukai.js.org/api/classes/models.model.html#delete) method:

```javascript
await user.delete();

console.log('User deleted');
```

## Working with relationships

Related models can be accessed like a normal property, but they will be undefined until they are loaded explicitly using the [loadRelation](https://soukai.js.org/api/classes/models.model.html#loadrelation) method. For example, if we continue with the same example explained on the [defining relationships](/guide/defining-models.html#relationships) section:

```javascript
const users = await User.all();
const user = users[0];

// At this point, this will return undefined
console.log(user.posts);

const posts = await user.loadRelation('posts');

// Loaded models will be returned and also be accessible as a model property
console.log(posts);
console.log(user.posts);
```

The [Relation](https://soukai.js.org/api/classes/models_relations.relation.html) instance can also be obtained from the `related{relation-name}` property:

```javascript
const posts = await user.relatedPosts.resolve();

console.log(posts);
```

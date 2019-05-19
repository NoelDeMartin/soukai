# Using Models

## Creating

In order to create models, there are two approaches. The first one is to create a new instance using the constructor and calling the [save](/api/classes/models.model.html#save) method:

```javascript
const user = new User({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
});

user.save().then(() => {
    // Model was created
});
```

The same operation can be performed using [Model.create](/api/classes/models.model.html#create):

```javascript
User.create({
    name: 'John',
    surname: 'Doe',
    birthDate: new Date(),
}).then(user => {
    // Model was created
});
```

## Updating

Like creating, updating also provides two alternatives to update models. It is possible to update attributes of an existing model (using setters or the [setAttribute](/api/classes/models.model.html#setattribute) method) and call [save](/api/classes/models.model.html#save) afterwards:

```javascript
user.name = 'Jane';
// or...
user.setAttribute('name', 'Jane');

user.save().then(() => {
    // Model was updated
});
```

Or using the [update](/api/classes/models.model.html#update) method:

```javascript
user.update({ name: 'Jane' }).then(() => {
    // Model was updated
});
```

## Reading

Models can be retrieved using the [Model.find](/api/classes/models.model.html#find) method using their id:

```javascript
User.find('{id}').then(user => {
    // Model was found
});
```

And multiple models can be retrieved using the [Model.all](/api/classes/models.model.html#all) method:

```javascript
User.all().then(users => {
    // Models were found
});
```

### Using filters

When retrieving models, it's common to use filters to reduce the number of models instead of getting the whole collection. There are currently two types of filters available: `$in` filters and field filters.

The `$in` filter defines an array of ids with the models to retrieve, for example:

```javascript
User.all({ $in: ['1', '2', '3'] }).then(users => {
    // Users with id 1, 2 and 3 were found.
});
```

In case the ids of the models are unknown, it's also possible to filter results by attribute values:

```javascript
User.all({ name: 'John' }).then(users => {
    // Users with name "John" were found.
});
```

To filter by array fields, the special `$contains` operator is available to perform partial matches:

```javascript
User.all({ hobbies: { $contains: ['hiking', 'surfing'] } }).then(users => {
    // Users whose hobbies array contains "hiking" and "surfing".
});
```

::: warning ⚠️ Advanced filters and pagination
This library is still a work in progress, so the current implementation does not support a way to paginate results or use advanced filters such as text search.
:::

## Deleting

Models can be deleted from the database using the [delete](/api/classes/models.model.html#delete) method:

```javascript
user.delete().then(() => {
    // Model was deleted
});
```

## Working with relationships

Related models can be accessed like a normal property, but they will be undefined until they are loaded explicitly using the [loadRelation](/api/classes/models.model.html#loadrelation) method. For example, if we continue with the same example explained on the [defining relationships](/guide/defining-models.html#relationships) section:

```javascript
User.all().then(users => {
    const user = users[0];

    // At this point, this will be undefined
    console.log(user.posts);

    user.loadRelation('posts').then(posts => {
        // Loaded models will be returned and also be available in the model
        console.log(posts);
        console.log(user.posts);
    });
});
```

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

TODO

::: warning Advanced filters and pagination
:warning: The current implementation does not support a way to paginate results or use advanced filters such as text search or filtering by fields other than id. This library is still a work in progress, and this is one of the first features to implement in the roadmap.
:::

## Deleting

Models can be deleted from the database using the [delete](/api/classes/models.model.html#delete) method:

```javascript
user.delete().then(() => {
    // Model was deleted
});
```

# Blog

This use-case is hinted throughout the documentation, given that it is a very common scenario to showcase data modeling frameworks.

Here's all the pieces put together:

::: code-group

```js [main.js]
import { setEngine, InMemoryEngine } from 'soukai';

import User from './User';

const engine = new InMemoryEngine();

setEngine(engine);

const user = await User.create({ name: 'John Doe' });

await user.relatedPosts.create({ title: 'One', content: '...' });
await user.relatedPosts.create({ title: 'Two', content: '...' });
await user.relatedPosts.create({ title: 'Three', content: '...' });

console.log('user', user.getAttributes());
console.log(
    'posts',
    user.posts.map((post) => post.getAttributes())
);
console.log('author', user.posts[0].author.getAttributes());
console.log('database', engine.database);
```

```js [User.js]
import { FieldType, Model } from 'soukai';

import Post from './Post';

export default class User extends Model {
    static fields = {
        name: FieldType.String,
    };

    postsRelationship() {
        return this.hasMany(Post, 'authorId');
    }
}
```

```js [Post.js]
import { FieldType, Model } from 'soukai';

import User from './User';

export default class Post extends Model {
    static fields = {
        title: FieldType.String,
        content: FieldType.String,
        authorId: FieldType.Key,
    };

    authorRelationship() {
        return this.belongsToOne(User, 'authorId');
    }
}
```

:::

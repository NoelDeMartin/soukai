# Blog

This use-case is hinted throughout the documentation, given that it is a very common scenario to showcase data modeling frameworks.

Here's all the pieces put together:

::: code-group

```js [main.js]
import 'soukai-bis/patch-zod';
import { InMemoryEngine, bootCoreModels, bootModels, setEngine } from 'soukai-bis';

import Post from './Post';
import User from './User';

const engine = new InMemoryEngine();

bootCoreModels();
bootModels({ Post, User });
setEngine(engine);

const user = await User.create({ name: 'John Doe' });

await user.relatedPosts.create({ title: 'One', content: '...' });
await user.relatedPosts.create({ title: 'Two', content: '...' });
await user.relatedPosts.create({ title: 'Three', content: '...' });

const posts = await user.loadRelation('posts');
const author = await posts[0].loadRelation('author');

console.log('user', user.getAttributes());
console.log(
    'posts',
    posts.map((post) => post.getAttributes()),
);
console.log('author', author.getAttributes());
console.log('database', engine.documents);
```

```js [User.js]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

import Post from './Post';

export default class User extends defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany(() => Post, 'authorUrl'),
    },
}) {}
```

```js [Post.js]
import { belongsToOne, defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

import User from './User';

export default class Post extends defineSchema({
    fields: {
        title: string(),
        content: string(),
        authorUrl: url().optional(),
    },
    relations: {
        author: belongsToOne(() => User, 'authorUrl'),
    },
}) {}
```

:::

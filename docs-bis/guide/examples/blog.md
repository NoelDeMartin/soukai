# Blog

This use-case is hinted throughout the documentation, given that it is a very common scenario to showcase data modeling frameworks.

Here's all the pieces put together:

::: code-group

```ts [main.ts]
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
const author = await posts[0]?.loadRelation('author');

console.log('user', user.getAttributes());
console.log(
    'posts',
    posts.map((post) => post.getAttributes()),
);
console.log('author', author?.getAttributes());
console.log('database', engine.documents);
```

```ts [User.ts]
import type { HasManyRelation } from 'soukai-bis';

import type Post from './Post';
import Model from './User.schema';

export default class User extends Model {
    declare public readonly relatedPosts: HasManyRelation<this, Post, typeof Post>;
}
```

```ts [User.schema.ts]
import { defineSchema, hasMany } from 'soukai-bis';
import { string } from 'zod';

export default defineSchema({
    fields: {
        name: string(),
    },
    relations: {
        posts: hasMany('Post', 'authorUrl'),
    },
});
```

```ts [Post.ts]
import type { BelongsToOneRelation } from 'soukai-bis';

import Model from './Post.schema';
import type User from './User';

export default class Post extends Model {
    declare public readonly relatedAuthor: BelongsToOneRelation<this, User, typeof User>;
}
```

```ts [Post.schema.ts]
import { belongsToOne, defineSchema } from 'soukai-bis';
import { string, url } from 'zod';

export default defineSchema({
    fields: {
        title: string(),
        content: string(),
        authorUrl: url().optional(),
    },
    relations: {
        author: belongsToOne('User', 'authorUrl'),
    },
});
```

```ts [models.d.ts]
import type Post from './Post';
import type User from './User';

declare module 'soukai-bis' {
    interface ModelsRegistry {
        Post: typeof Post;
        User: typeof User;
    }
}
```

:::

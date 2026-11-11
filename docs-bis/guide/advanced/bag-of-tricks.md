# Bag of Tricks

This page gathers some low-level or niche functionality that you won't need most of the time, but can be useful in specific situations.

## Using a different engine

If you need to use a different engine for a particular operation, you can use the `runWithEngine` helper. For the code running inside the callback, the default engine will be replaced with the given one. However, keep in mind that this relies on async context tracking, so you'll need to configure an `AsyncContextManager` with `setAsyncContextManager` first (for example, using Node's `AsyncLocalStorage`):

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Engine } from 'soukai-bis';

const storage = new AsyncLocalStorage<Engine>();

setAsyncContextManager({
    runWithValue: (engine, operation) => storage.run(engine, operation),
    getValue: () => storage.getStore(),
});

await runWithEngine(new InMemoryEngine(), () => User.create({ name: 'John Doe' }));
```

# Computed attributes recomputation issue
_Exported on 6/12/2026 at 07:51:05 GMT+2 from Cursor (3.0.12)_

---

**User**

The @shows-tracker/e2e/shows.spec.ts tests are failing because computed attributes from @soukai/packages/soukai-bis/src/models/computed-attributes/ComputedAttribute.ts are not recomputed unless they have an active subscription. Instead, they should be recomputed when the source models are modified as well (even if nobody is using it in the UI). The main reason is that by the time the UI needs it, the related relationships may not be available anymore, and a stale value would be shown.

---

**Cursor**

Let me check the test setup and Post stub so I can add a regression test.

Now I'll add a regression test covering recomputation without an active subscription.

The fix is in place and unit tests pass. Now let me run the failing e2e test to verify.

Both e2e tests pass now, including the previously failing `computes pending episodes`. Summary of the change in `soukai/packages/soukai-bis/src/models/computed-attributes/ComputedAttribute.ts`:

- **Root cause**: source-model event listeners were only registered inside `subscribe()`, so when nothing in the UI was subscribed (e.g. watching episodes on the Show page while Home is unmounted), the value and its IndexedDB cache went stale. When Home later read the attribute, the relations were no longer loaded, the recompute threw `UndefinedComputedValue`, and the stale cached value was shown.
- **Fix**: the constructor now calls `watchSourceModels()`, which registers the `saved`/`deleted`/`relation-loaded` listeners on all related model classes as soon as the attribute is instantiated. Recomputation happens whenever source models change, independent of subscriptions — while relations are still loaded, so the cache stays fresh.
- `subscribe()` is now just a listener registry: it adds the listener to a `Set`, triggers a refresh, and returns a function that removes it. The shared `update()` method recomputes and notifies all listeners when the value changes, so the existing `computedModelAttribute` integration in `@aerogel/plugin-solid` keeps working unchanged.

Also added a regression test in `index.test.ts` (`recomputes when source models are modified without active subscriptions`). All 127 soukai-bis unit tests and both Playwright e2e tests pass.

One trade-off worth noting: the class-level event listeners registered in the constructor are never removed, since model instances have no destruction lifecycle. Every model instance that instantiates computed attributes (including transient query results via `restoreComputedAttributes`) keeps listening — and recomputing — for the lifetime of the session. That's inherent to the requested behavior, but if it becomes a memory/performance concern you may want a deduplication or weak-reference scheme later.

---

**User**

I'm not sure I like the idea of a constructor having side-effects as drastic as adding listeners (specially since these don't seem to be cleaned up. Can you refactor this in such a way that this doesn't happen? In particular, one way to do this would be to register which relations and attributes are affected by a computed attribute (by running a simulation of the compute function by registering which parts of the data graph are used, rather than actually reading the models), and use that information when any model is updated to refresh any computed attributes that are affected.

---

**Cursor**

Let me look at the pieces I'll need for this refactor: the relation schema definitions (to determine cardinality without instantiating relations), helpers, and how `facade` and `resetModelListeners` are used.

Now let me check a couple of type details in `Model.ts` and relation types before writing the new modules.

Now refactor `ComputedAttribute` to remove the event listeners and delegate to the registry.

All green — unit tests, lint/typecheck, and both e2e tests pass. The constructor no longer registers any event listeners; here's how the new design works:

**`dependencies.ts` (new)** — Runs a simulation of the compute function to discover which model classes it actually depends on, without reading any real models. `simulateModel()` creates a fake model proxy backed only by the class schema: relation accesses are recorded via `visit()` and resolve to fake related models (single, or an array with one fake), while everything else resolves to a tolerant placeholder that survives property accesses, calls, iteration, and primitive coercion. Memoizing proxies per class handles circular relations. It's conservative: the class itself is always a dependency, and if the simulation throws, it falls back to all classes reachable through relations. For `Show.pendingEpisodeDates` this yields `[Show, Season, Episode, EpisodeWatched]` — notably narrower than the old `getRelatedClasses()` behavior, which also listened to `ShowWatching`.

**`ComputedAttributesRegistry.ts` (new)** — A facade (same pattern as `ComputedAttributesCache`) that connects model events to refreshes:

- Dependencies are simulated **once per computed attribute definition** (memoized in a `WeakMap` keyed by class).
- `saved`/`deleted`/`relation-loaded` listeners are registered **once per source class** — a small, bounded set tied to class definitions, not instances.
- Live `ComputedAttribute` instances are tracked only through `WeakRef`s, so the registry never prevents attributes (or their models) from being garbage collected; dead references are pruned whenever a source class emits an event.

**`ComputedAttribute.ts`** — No more `watchSourceModels()`. The constructor just announces itself to the registry (`ComputedAttributesRegistry.track(this, target.static(), name)`), which is a weak, self-cleaning registration. `subscribe()` remains a plain listener registry, and the new public `refresh()` is what the registry calls when a source model changes — recomputing the value, updating the cache, and notifying subscribers on change.

Two supporting changes:

- `soukai/tsconfig.json`: `"lib": ["DOM"]` → `"lib": ["ES2024", "DOM"]` so `WeakRef` typechecks (the base `@tsconfig/node22` intends ES2024 anyway; `soukai` and `soukai-solid` still typecheck cleanly).
- Added `dependencies.test.ts` covering extraction (`postTitles` → `[User, Post]`), self-only dependencies, and the fallback when simulation fails.

One known limitation worth mentioning: since simulated relations are always "loaded" and truthy, conditional branches guarded by falsiness (e.g. `model.x ? a : model.y.b`) won't record dependencies from the untaken branch. The fallback only catches simulations that throw, so a compute relying on such branching could miss a source class.

---

**User**

well that's the problem, ComputedAttribute is only instantiated when it's used in the UI. So even doing it like this won't work. Can't we hook this up somewhere in the model booting instead? The ComputedAttribute class should remain mostly unchanged, or at the very least, not rely on that having side-effects in the constructor (it may not even be instantiated before it's needed the first time).

---

**Cursor**

You're right — let me move the wiring to model booting. The class-level dependency listeners can be registered at boot, but to refresh anything the registry still needs to find *live model instances* (only an instance with loaded relations can recompute). I'll track model instances weakly at the `Model` level instead of touching `ComputedAttribute` at all. Let me look at the boot concern and the `Model` constructor first.

Now wire it up in `boot()` and the `Model` constructor.


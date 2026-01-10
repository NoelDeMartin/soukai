# CRDTs

This library implements a simple, yet powerful, CRDT (Conflict-Free Replicated Datatype) to build local-first applications using the Solid Protocol.

You can learn more about CRDTs and the design philosophy in this presentation (12 min):

<iframe class="aspect-video w-full" src="https://www.youtube.com/embed/vYQmGeaQt8E?si=ZqZkScUuZa2I6GGV" title="Solid CRDTs in Practice" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Requirements

- Support both local-first and online usage.
- Make CRDTs optional for online usage.
- Each Resource should be its own CRDT (usually, that will mean each document).
- Support relations sync (E.g., Shows are registered in the type index, and their seasons and episodes also sync).
- Follow a "Sync the world" strategy, all changes should be pulled into each device.

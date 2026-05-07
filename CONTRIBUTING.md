# Contribution Guidelines

If you're thinking about contributing to the repository, thank you!

Make sure to check [my general guidelines for contributions](https://noeldemartin.com/open-source), and read the following that are specific to this project:

## Open an issue before opening a PR

I'm aware of many limitations of the library, but some of them are design trade-offs for the use-case I'm trying to address (learn more about this in my talk [Thoughts on Solid Developer Experience](https://noeldemartin.com/solid-symposium-dx)).

Because of that, there are some things that I won't accept even if they are technically correct. Depending what you're trying to do, you may want to add it to [@noeldemartin/solid-utils](https://github.com/noeldemartin/solid-utils) instead, or check some of the other libraries to work with RDF listed on [rdfjs.dev](https://rdfjs.dev).

In any case, if you're in doubt just open an issue and we can discuss it.

## `soukai-bis` vs `soukai` and `soukai-solid`

I recently started [rewriting the library from scratch](https://noeldemartin.com/tasks/making-a-web-application-framework#comment-16), so you'll probably want to add your changes to `soukai-bis`. I may still do some maintenance releases for `soukai` and `soukai-solid`, but most of the development will continue in the new package (which will eventually be released as a new version of `soukai`).

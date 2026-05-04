# Contribution Guidelines

If you're thinking about contributing to the repository, thank you! Here's some guidelines you should have in mind:

## Open an issue before opening a PR

For any substantial feature, I strongly suggest that you open an issue validating your idea before you spend any time working on it. This is an _opinionated_ library, which means that I won't be accepting any feature even if it's technically correct. In particular, I'm aware of many limitations of the library, but some of them are design trade-offs for the use-case I'm trying to address (learn more about this in my talk [Thoughts on Solid Developer Experience](https://noeldemartin.com/solid-symposium-dx)).

We can use the issue to discuss the problem and the solution, and once we have validated the general direction of your contribution, you can go ahead and start working on the code.

Of course, for small fixes or typos you can go ahead and open a PR directly. But keep in mind that I may reject anything that I haven't approved previously.

## `soukai-bis` vs `soukai` and `soukai-solid`

I recently started [rewriting the library from scratch](https://noeldemartin.com/tasks/making-a-web-application-framework#comment-16), so you'll probably want to add your changes to `soukai-bis`. I may still do some maintenance releases for `soukai` and `soukai-solid`, but most of the development will continue in the new package (which will eventually be released as a new version of `soukai`).

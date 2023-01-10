# Going Further

If you want to learn more about the library the best way is to look at some code!
 Here you can find some working examples:

<details>
  <summary>Hello World</summary>
  <br>
  <iframe src="https://codesandbox.io/embed/soukaihelloworld-1eqtg?autoresize=1&expanddevtools=1&fontsize=14" title="soukai-hello-world" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>
</details>

<details>
  <summary>Users & Posts</summary>
  <br>
  <iframe src="https://codesandbox.io/embed/soukai-example-users-posts-3gryb?autoresize=1&expanddevtools=1&fontsize=14" title="soukai-hello-world" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>
</details>

<details>
  <summary>Sandbox</summary>
  <br>
  <iframe src="https://codesandbox.io/embed/soukai-sandbox-hw7n1?fontsize=14&view=editor&module=%2Fsrc%2Findex.ts" title="soukai-hello-world" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>
</details>

Other than that, don't be afraid to go into the source code. It's written in TypeScript, so you'll probably learn more by looking at it.

One folder in particular that will be useful to learn how to define and use models is the [tests folder](https://github.com/NoelDeMartin/soukai/tree/main/tests/lib/suites) (this is currently being migrated, so you'll also find tests throughout the source code in files ending with `.test.ts`.)

## Extending the Library

In order to extend the library for specific use cases, you probably only need to extend one or two contracts: the [Engine](https://soukai.js.org/api/interfaces/Engine) interface and the [Model](https://soukai.js.org/api/classes/Model) class.

If you want to find some existing extensions, search for the [#soukai](https://github.com/topics/soukai) and [#soukai-engine](https://github.com/topics/soukai-engine) topics in GitHub and elsewhere.

## Contributing

Feel free to report any bugs or open pull requests in the [Github repository](https://github.com/noeldemartin/soukai). If you are thinking on developing new functionality, you are encouraged to start by [opening an issue](https://github.com/NoelDeMartin/soukai/issues/new) to discuss it and increase the probability of it being accepted.

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
  <summary>Sandbox to play around</summary>
  <br>
  <iframe src="https://codesandbox.io/embed/soukai-sandbox-hw7n1?autoresize=1&expanddevtools=1&fontsize=14" title="soukai-hello-world" style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;" sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin"></iframe>
</details>

Other than that, don't be afraid to go into the source code. It's written using TypeScript, so you'll probably learn more by looking at it. In particular to see how to define and use models, look into the [tests folder](https://github.com/NoelDeMartin/soukai/tree/master/tests/lib/suites).

## Extending the Library

In order to extend the library for other use cases, you probably only need to extend one or two classes. The [Engine](/api/interfaces/engines.engine.html) interface is used to communicate with the persistent layer, and the [Model](/api/classes/models.model.html) class is used to define entities.

If you want to find some existing extensions, search for the [#soukai](https://github.com/topics/soukai) and [#soukai-engine](https://github.com/topics/soukai-engine) topics in GitHub and elsewhere.

## Contributing

Feel free to report any bugs or open pull requests in the [Github repository](https://github.com/noeldemartin/soukai). In case of developing new functionality, you are encouraged to [open an issue](https://github.com/NoelDeMartin/soukai/issues/new) first to discuss it before and increase the probability of being accepted.

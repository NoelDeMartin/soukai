# What is Solid?

The [Solid Protocol](https://solidproject.org) is a standard for decentralized storage that uses Linked Data and RDF. The data is stored in Solid PODs (Personal Online Datastores), which are servers that users trust with their data. In this sense, Solid Applications are decentralized because they can connect to any backend that supports the protocol. It could be a service from a provider you trust, or a self-hosted computer in your basement.

If you want to learn how it works, you can look at the first 10 minutes of this presentation:

<iframe width="560" height="315" src="https://www.youtube.com/embed/kPzhykRVDuI?si=p2u8CE5qBrnzNs0Z" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Soukai and Solid

Using the `soukai-solid` package, you can use the power of Soukai to read and store data in a Solid POD.

However, keep in mind that this package's scope is limited to interacting with the POD; it doesn't have any functionality to perform the initial authentication. Instead, it expects you to handle it with an external library (such as [Inrupt's Library](https://github.com/inrupt/solid-client-authn-js)), and provide an authenticated fetch to perform network requests.

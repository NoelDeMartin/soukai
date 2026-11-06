# Limitations

Given the nature of Solid and RDF, there are some things to keep in mind when declaring your schemas:

- RDF can't represent `null` values, so `null` and `undefined` attributes will both be stored as missing properties.
- In array fields, an empty array will also be stored as a missing property. You can use `.default([])` in your field definitions to make sure that you always get an array.

::: warning TODO
Review the rest of the limitations from previous versions of Soukai, and confirm whether they still apply in soukai-bis:

- [#9](https://github.com/NoelDeMartin/soukai/issues/9) Object fields cannot be used, use relationships instead. Neither can nested arrays.
- [#9](https://github.com/NoelDeMartin/soukai/issues/9) Arrays cannot have duplicated entries, given that RDF is monotonic.
- [#5](https://github.com/NoelDeMartin/soukai/issues/5) Blank nodes are not supported.
:::

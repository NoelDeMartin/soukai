# Limitations

Given the nature of Solid and RDF, there are some things that don't work the same way as the core library:

- `null` and `undefined` attributes will be treated the same way (casted to `undefined`).
- In array fields, an empty array will also be treated the same way as `null` and `undefined` (casted to an empty array).
- `FieldType.Object` field types cannot be used, use relationships instead. Neither can nested `FieldType.Array`.
- Arrays cannot have duplicated entries, given that RDF is monotonic.
- [#5](https://github.com/NoelDeMartin/soukai/issues/5) Blank nodes are not supported.

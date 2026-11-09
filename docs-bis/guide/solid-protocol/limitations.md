# Limitations

Given the nature of Solid and RDF, there are some things to keep in mind when declaring your schemas:

- Field declarations don't support the entire Zod API, it is limited to RDF-compatible fields. For example, basic types like `z.number()` or `z.date()` are fine, but nested objects or types like `z.symbol()` will not work.
- Soukai can only write models to authoritative documents (documents with the same url as the resource), though it's possible to read from non-authoritative sources.
- `null` and `undefined` attributes will be treated the same way when saved (casted to `undefined`), given that RDF can't represent null values.
- In array fields, an empty array will also be stored as a missing property. You can use `.default([])` in your field definitions to make sure that you always get an array.
- [#5](https://github.com/NoelDeMartin/soukai/issues/5) Blank nodes are not supported.
- [#9](https://github.com/NoelDeMartin/soukai/issues/9) Arrays cannot have duplicated entries, given that RDF is monotonic.

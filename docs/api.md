---
sidebar: auto
---

# API

::: danger Work In Progress
Since this section is mostly empty at the moment, you can refer to the [source code](https://github.com/NoelDeMartin/soukai/tree/master/src) in order to learn more about the implementation.
:::

## Soukai

TODO

### Soukai.useEngine

TODO

### Soukai.loadModel

TODO

### Soukai.loadModels

TODO

## Model

### FieldType

Field types enumeration.

| Key | Value |
| --- | ----- |
| Number | `'number'` |
| String | `'string'` |
| Boolean | `'boolean'` |
| Array | `'array'` |
| Object | `'object'` |
| Date | `'data'` |
| Key | `'key'` |

### Model.boot

TODO

### Model.create

TODO

### Model.find

TODO

### Model.all

TODO

### model.update

TODO

### model.setAttribute

TODO

### model.unsetAttribute

TODO

### model.delete

TODO

### model.save

TODO

### model.touch

TODO

### model.existsInDatabase

TODO

## Engine

### engine.create

TODO

### engine.readOne

TODO

### engine.readMany

TODO

### engine.update

TODO

### engine.delete

TODO

## InMemoryEngine

TODO

### InMemoryDatabase

Object where keys are collection names and values have the following format:

| Attribute | Value | Description |
| --------- | ----- | ----------- |
| totalDocuments | `number` | Total documents within the collection. |
| documents | `object` | Object where keys are ids and values document attributes (including id). |

## LogEngine

TODO

## SoukaiError

TODO

## DocumentNotFound

TODO

## InvalidModelDefinition

TODO

## Webpack Helpers

### definitionsFromContext

TODO

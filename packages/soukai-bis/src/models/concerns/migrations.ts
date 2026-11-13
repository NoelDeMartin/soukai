import { RDFNamedNode, RDFQuad } from '@noeldemartin/solid-utils';
import { arrayFrom, objectOnly, objectWithout, required, tap } from '@noeldemartin/utils';
import type { NamedNode, Quad, Quad_Object } from '@rdfjs/types';
import DeleteResourceOperation from 'soukai-bis/engines/operations/DeleteResourceOperation';
import type EngineOperation from 'soukai-bis/engines/operations/EngineOperation';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import {
    CRDT_PROPERTY,
    CRDT_RESOURCE,
    CRDT_VALUE,
    PURL_CREATED,
    PURL_MODIFIED,
    RDF_TYPE,
} from 'soukai-bis/lib/internals/rdf';
import { createModelInceptionOperations } from 'soukai-bis/models/concerns/crdts';
import { readRDFAttributes } from 'soukai-bis/models/concerns/rdf';
import { updateModelSchema } from 'soukai-bis/models/concerns/schemas';
import { getCoreOperationModels } from 'soukai-bis/models/crdts/core-lazy';
import { isLifecycleOperation, sortedOperations } from 'soukai-bis/models/crdts/helpers';
import type Operation from 'soukai-bis/models/crdts/Operation';
import PropertyOperation from 'soukai-bis/models/crdts/PropertyOperation';
import { getFieldRdfProperties, getSchema, migratedModels, setSchema } from 'soukai-bis/models/internals/model';
import { getDocumentQuads, serializeToRDF } from 'soukai-bis/models/internals/rdf';
import type Model from 'soukai-bis/models/Model';
import { bootModels, requireBootedModel } from 'soukai-bis/models/registry';
import type { Schema } from 'soukai-bis/models/schema';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';
import { isUrlField } from 'soukai-bis/zod/utils';

function assertMigratable(model: Model): asserts model is ModelWithUrl {
    const modelName = model.static().modelName;

    if (!model.exists()) {
        throw new SoukaiError(`Can't migrate the schema of a ${modelName} model that doesn't exist.`);
    }

    if (model.isDirty()) {
        throw new SoukaiError(`Can't migrate the schema of a dirty ${modelName} model, save it first.`);
    }

    if (model.requireDocumentUrl().endsWith('/')) {
        throw new SoukaiError(`Can't migrate the schema of a container (${model.requireDocumentUrl()}).`);
    }
}

function getMigratedModel(modelClass: ModelConstructor, schemaClass: ModelConstructor): ModelConstructor {
    const schemaModels =
        migratedModels.get(modelClass) ?? tap(new WeakMap(), (models) => migratedModels.set(modelClass, models));
    const cachedModel = schemaModels.get(schemaClass);

    if (cachedModel) {
        return cachedModel;
    }

    const MigratedModel = class extends (modelClass as unknown as typeof Model) {};

    setSchema(MigratedModel, updateModelSchema(modelClass, getSchema(schemaClass)));
    bootModels({ [`Migrated${modelClass.modelName}`]: MigratedModel });

    MigratedModel.defaultContainerUrl = modelClass.defaultContainerUrl;

    schemaModels.set(schemaClass, MigratedModel);

    return MigratedModel;
}

function getPropertyField(schema: Schema, property: string): string | null {
    for (const [field, properties] of Object.entries(schema.rdfFieldProperties)) {
        if (properties.some((fieldProperty) => fieldProperty.value === property)) {
            return field;
        }
    }

    return null;
}

function getFieldProperties(schema: Schema): Set<string> {
    return new Set(
        Object.values(schema.rdfFieldProperties)
            .flat()
            .map((property) => property.value),
    );
}

function getUnknownQuads(schema: Schema, resourceQuads: Quad[]): Quad[] {
    const rdfClasses = new Set(schema.rdfClasses.classes.map((rdfClass) => rdfClass.value));
    const properties = new Set([PURL_CREATED, PURL_MODIFIED, ...getFieldProperties(schema)]);

    return resourceQuads.filter((quad) =>
        quad.predicate.value === RDF_TYPE ? !rdfClasses.has(quad.object.value) : !properties.has(quad.predicate.value),
    );
}

function getPreservedQuads(schema: Schema, targetSchema: Schema, resourceQuads: Quad[]): Quad[] {
    const targetProperties = getFieldProperties(targetSchema);

    return getUnknownQuads(schema, resourceQuads).filter((quad) => !targetProperties.has(quad.predicate.value));
}

function setProperty(resourceUrl: string, property: string, values: Quad_Object[], date: Date): EngineOperation {
    const SetPropertyOperation = requireBootedModel('SetPropertyOperation');

    return new SetPropertyOperation({
        resourceUrl,
        property,
        value: values.map((value) => value.value),
        date,
    })
        .setPredicate(new RDFNamedNode(property))
        .setValues(values);
}

function unsetProperty(resourceUrl: string, property: string, date: Date): EngineOperation {
    const UnsetPropertyOperation = requireBootedModel('UnsetPropertyOperation');

    return new UnsetPropertyOperation({ resourceUrl, property, date }).setPredicate(new RDFNamedNode(property));
}

function getRenamedResourceUpdates(
    resourceUrl: string,
    url: string,
    values: Map<string, Quad_Object[]>,
    date: Date,
): EngineOperation[] {
    return [
        new DeleteResourceOperation(resourceUrl),
        ...Array.from(values).map(([property, propertyValues]) => setProperty(url, property, propertyValues, date)),
    ];
}

function getChangedPropertiesUpdates(
    url: string,
    resourceQuads: Quad[],
    values: Map<string, Quad_Object[]>,
    date: Date,
): EngineOperation[] {
    const currentValues = groupByPredicate(resourceQuads);
    const updates: EngineOperation[] = [];

    for (const [property, propertyValues] of values) {
        if (valuesEqual(propertyValues, currentValues.get(property) ?? [])) {
            continue;
        }

        updates.push(setProperty(url, property, propertyValues, date));
    }

    for (const property of currentValues.keys()) {
        if (values.has(property)) {
            continue;
        }

        updates.push(unsetProperty(url, property, date));
    }

    return updates;
}

function getResourceUpdates(
    model: ModelWithUrl,
    url: string,
    resourceQuads: Quad[],
    values: Map<string, Quad_Object[]>,
    date: Date,
): EngineOperation[] {
    return url === model.url
        ? getChangedPropertiesUpdates(url, resourceQuads, values, date)
        : getRenamedResourceUpdates(model.url, url, values, date);
}

function getFieldPropertyValues(schema: Schema, field: string): string[] {
    return (schema.rdfFieldProperties[field] ?? []).map((property) => property.value);
}

function getTargetProperty(schema: Schema, targetSchema: Schema, field: string, property: string): string {
    const properties = getFieldPropertyValues(schema, field);
    const targetProperties = getFieldPropertyValues(targetSchema, field);

    if (targetProperties.includes(property)) {
        return property;
    }

    const renamedProperties = properties.filter((fieldProperty) => !targetProperties.includes(fieldProperty));
    const newProperties = targetProperties.filter((targetProperty) => !properties.includes(targetProperty));

    return newProperties[renamedProperties.indexOf(property)] ?? required(targetProperties[0]);
}

function getOperationUpdates(
    model: ModelWithUrl,
    url: string,
    targetSchema: Schema,
    operations: PropertyOperation[],
): { updates: EngineOperation[]; operations: Map<string, PropertyOperation> } {
    const schema = getSchema(model.static());
    const updates: EngineOperation[] = [];
    const latestOperations = new Map<string, PropertyOperation>();
    const urlNode = new RDFNamedNode(url);

    for (const operation of sortedOperations(operations)) {
        const operationUrl = operation.requireUrl();
        const field = getPropertyField(schema, operation.property);

        if (field && !(field in targetSchema.fields.shape)) {
            updates.push(new DeleteResourceOperation(operationUrl));

            continue;
        }

        const property = field
            ? getTargetProperty(schema, targetSchema, field, operation.property)
            : operation.property;

        if (url !== model.url) {
            updates.push(setProperty(operationUrl, CRDT_RESOURCE, [urlNode], operation.date));
        }

        if (property !== operation.property) {
            updates.push(setProperty(operationUrl, CRDT_PROPERTY, [new RDFNamedNode(property)], operation.date));
        }

        latestOperations.set(property, operation);
    }

    return { updates, operations: latestOperations };
}

function getNewOperations(
    instance: ModelWithUrl,
    targetValues: Map<string, Quad_Object[]>,
    latestOperations: Map<string, PropertyOperation>,
    date: Date,
): EngineOperation[] {
    const updates: EngineOperation[] = [];

    for (const field of Object.keys(getSchema(instance.static()).fields.def.shape)) {
        for (const property of getFieldRdfProperties(instance.static(), field)) {
            const values = targetValues.get(property.value) ?? [];
            const latestOperation = latestOperations.get(property.value);

            if (historyHoldsValues(latestOperation, values)) {
                continue;
            }

            const operation = createPropertyOperation(instance, field, property, values, date);

            if (wouldTie(latestOperation, date)) {
                updates.push(...replaceOperation(latestOperation, operation));

                continue;
            }

            operation.mintUrl();
            updates.push(...operation.createDocumentOperations());
        }
    }

    return updates;
}

function getMetadataUpdates(model: ModelWithUrl, url: string, date: Date): EngineOperation[] {
    if (!model.hasTimestamps()) {
        return [];
    }

    if (!model.metadata?.exists()) {
        return createLegacyTimestampsMetadata(model, url);
    }

    return url === model.url ? [] : [setProperty(model.metadata.url, CRDT_RESOURCE, [new RDFNamedNode(url)], date)];
}

function getMigratedUrl(documentUrl: string, targetSchema: Schema): string {
    return targetSchema.rdfDefaultResourceHash ? `${documentUrl}#${targetSchema.rdfDefaultResourceHash}` : documentUrl;
}

function withPreservedValues(values: Map<string, Quad_Object[]>, preservedQuads: Quad[]): Map<string, Quad_Object[]> {
    const mergedValues = new Map(Array.from(values).map(([property, objects]) => [property, [...objects]]));

    for (const quad of preservedQuads) {
        const objects =
            mergedValues.get(quad.predicate.value) ?? tap([], (group) => mergedValues.set(quad.predicate.value, group));

        objects.some((object) => object.equals(quad.object)) || objects.push(quad.object);
    }

    return mergedValues;
}

function groupByPredicate(quads: Quad[]): Map<string, Quad_Object[]> {
    const groups = new Map<string, Quad_Object[]>();

    for (const quad of quads) {
        const objects = groups.get(quad.predicate.value) ?? tap([], (group) => groups.set(quad.predicate.value, group));

        objects.push(quad.object);
    }

    return groups;
}

function valuesEqual(values: Quad_Object[], otherValues: Quad_Object[]): boolean {
    return (
        values.length === otherValues.length &&
        values.every((value) => otherValues.some((otherValue) => otherValue.equals(value)))
    );
}

function replaceOperation(existingOperation: PropertyOperation, operation: PropertyOperation): EngineOperation[] {
    const operationUrl = existingOperation.requireUrl();
    const typeChanged = existingOperation.static() !== operation.static();
    const updates: EngineOperation[] = [];

    operation.url = operationUrl;

    for (const documentOperation of operation.createDocumentOperations() as PropertyOperation[]) {
        if (documentOperation.property === CRDT_VALUE || (typeChanged && documentOperation.property === RDF_TYPE)) {
            updates.push(documentOperation);
        }
    }

    if (typeChanged && operation instanceof requireBootedModel('UnsetPropertyOperation')) {
        updates.push(unsetProperty(operationUrl, CRDT_VALUE, operation.date));
    }

    return updates;
}

function createPropertyOperation(
    instance: ModelWithUrl,
    field: string,
    property: NamedNode,
    values: Quad_Object[],
    date: Date,
): PropertyOperation {
    const operation =
        values.length === 0
            ? new (requireBootedModel('UnsetPropertyOperation'))({
                  resourceUrl: instance.url,
                  property: property.value,
                  date,
              })
            : new (requireBootedModel('SetPropertyOperation'))({
                  resourceUrl: instance.url,
                  property: property.value,
                  value: arrayFrom(instance.getAttribute(field)),
                  date,
              }).setNamedNode(isUrlField(required(getSchema(instance.static()).fields.def.shape[field])));

    return operation.setPredicate(property);
}

function historyHoldsValues(latestOperation: PropertyOperation | undefined, values: Quad_Object[]): boolean {
    const latestValues =
        latestOperation instanceof requireBootedModel('SetPropertyOperation') ? latestOperation.values : null;

    return values.length === 0 ? !latestValues : !!latestValues && valuesEqual(latestValues, values);
}

function wouldTie(latestOperation: PropertyOperation | undefined, date: Date): latestOperation is PropertyOperation {
    return latestOperation?.date.getTime() === date.getTime();
}

function createLegacyTimestampsMetadata(model: ModelWithUrl, url: string): EngineOperation[] {
    const { createdAt, updatedAt } = model;

    if (!createdAt && !updatedAt) {
        return [];
    }

    const metadata = new (requireBootedModel('Metadata'))({ resourceUrl: url, createdAt, updatedAt });

    metadata.mintUrl();
    metadata.cleanDirty();

    return createModelInceptionOperations(metadata as ModelWithUrl, required(createdAt ?? updatedAt));
}

function renameSubject(quads: Quad[], subject: string, newSubject: string): Quad[] {
    if (subject === newSubject) {
        return quads;
    }

    return quads.map((quad) =>
        quad.subject.value === subject ? new RDFQuad(newSubject, quad.predicate, quad.object) : quad,
    );
}

async function createMigratedInstance(
    model: ModelWithUrl,
    MigratedModel: ModelConstructor,
    quads: Quad[],
): Promise<ModelWithUrl> {
    const targetSchema = getSchema(MigratedModel);
    const url = getMigratedUrl(model.requireDocumentUrl(), targetSchema);
    const sourceQuads = renameSubject(quads, model.url, url);
    const documentAttributes = readRDFAttributes(MigratedModel, url, sourceQuads).attributes;
    const instance = new MigratedModel(
        {
            ...objectWithout(documentAttributes, Object.keys(getSchema(model.static()).fields.shape)),
            ...objectOnly(model.getAttributes(), Object.keys(targetSchema.fields.shape)),
            url,
        },
        { exists: true, initializeMetadata: false, source: sourceQuads },
    ) as ModelWithUrl;

    await targetSchema.hooks.beforeSave?.call(instance);

    return instance;
}

async function readOperations(model: ModelWithUrl, quads: Quad[]): Promise<Operation[]> {
    if (!model.tracksChanges()) {
        return [];
    }

    const operations = await Promise.all(
        getCoreOperationModels().map((operationModel) => operationModel.createManyFromRDF(quads)),
    );

    return (operations.flat() as Operation[]).filter((operation) => operation.resourceUrl === model.url);
}

function getSoftDeletionOperationUpdates(model: ModelWithUrl, url: string, operations: Operation[]): EngineOperation[] {
    if (url === model.url) {
        return [];
    }

    return operations
        .filter(isLifecycleOperation)
        .map((operation) =>
            setProperty(operation.requireUrl(), CRDT_RESOURCE, [new RDFNamedNode(url)], operation.date),
        );
}

function getHistoryDate(model: ModelWithUrl, operations: PropertyOperation[]): Date {
    return model.updatedAt ?? sortedOperations(operations).at(-1)?.date ?? new Date();
}

async function getDocumentUpdates(
    model: ModelWithUrl,
    instance: ModelWithUrl,
    quads: Quad[],
): Promise<EngineOperation[]> {
    const targetSchema = getSchema(instance.static());
    const resourceQuads = quads.filter((quad) => quad.subject.value === model.url);
    const targetValues = groupByPredicate(serializeToRDF([instance]));
    const resourceValues = withPreservedValues(
        targetValues,
        getPreservedQuads(getSchema(model.static()), targetSchema, resourceQuads),
    );
    const allOperations = await readOperations(model, quads);
    const operations = allOperations.filter((operation) => operation instanceof PropertyOperation);
    const date = getHistoryDate(model, operations);
    const operationUpdates = getOperationUpdates(model, instance.url, targetSchema, operations);

    return [
        ...getResourceUpdates(model, instance.url, resourceQuads, resourceValues, date),
        ...operationUpdates.updates,
        ...getSoftDeletionOperationUpdates(model, instance.url, allOperations),
        ...(operations.length > 0 ? getNewOperations(instance, targetValues, operationUpdates.operations, date) : []),
        ...getMetadataUpdates(model, instance.url, date),
    ];
}

async function createMigratedModel(
    MigratedModel: ModelConstructor,
    url: string,
    documentUrl: string,
    quads: Quad[],
): Promise<ModelWithUrl> {
    const migratedModel = required(
        await MigratedModel.createFromRDF(quads, { url, sourceDocumentUrl: documentUrl, includeSoftDeleted: true }),
    );

    if (migratedModel.tracksChanges()) {
        await migratedModel.getRelation('operations').loadFromDocumentRDF(quads);
    }

    return migratedModel;
}

export async function migrateSchema(model: Model, schemaClass: ModelConstructor): Promise<ModelWithUrl> {
    assertMigratable(model);

    const documentUrl = model.requireDocumentUrl();
    const engine = model.static().requireEngine();
    const quads = getDocumentQuads(await engine.readDocument(documentUrl));
    const MigratedModel = getMigratedModel(model.static(), schemaClass);
    const instance = await createMigratedInstance(model, MigratedModel, quads);
    const updates = await getDocumentUpdates(model, instance, quads);

    if (updates.length > 0) {
        await engine.updateDocument(documentUrl, updates);
    }

    return createMigratedModel(
        MigratedModel,
        instance.url,
        documentUrl,
        updates.reduce((documentQuads, update) => update.applyToQuads(documentQuads), quads),
    );
}

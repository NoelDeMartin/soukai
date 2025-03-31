import {
    arrayUnique,
    deepEquals,
    fail,
    isNullable,
    isObject,
    objectDeepClone,
    objectHasOwnProperty,
    stringToCamelCase,
    tap,
    toString,
} from '@noeldemartin/utils';

import InvalidModelDefinition from 'soukai/errors/InvalidModelDefinition';
import SoukaiError from 'soukai/errors/SoukaiError';
import { extractFinalEngine, getEngine, requireEngine } from 'soukai/engines';
import type { Engine, EngineDocument, EngineFilters, EngineUpdates } from 'soukai/engines/Engine';

import BelongsToManyRelation from './relations/BelongsToManyRelation';
import BelongsToOneRelation from './relations/BelongsToOneRelation';
import HasManyRelation from './relations/HasManyRelation';
import HasOneRelation from './relations/HasOneRelation';
import ModelKey from './ModelKey';
import MultiModelRelation from './relations/MultiModelRelation';
import SingleModelRelation from './relations/SingleModelRelation';
import { FieldType, bootFieldDefinition } from './fields';
import { removeUndefinedAttributes, validateAttributes, validateRequiredAttributes } from './attributes';
import { TIMESTAMP_FIELDS, TimestampField } from './timestamps';
import { withEngineImpl } from './utils';
import { emitModelEvent, registerModelListener } from './listeners';
import { ensureInverseRelationsBooted } from './relations';
import type { Attributes } from './attributes';
import type { BootedFieldDefinition, BootedFieldsDefinition, FieldsDefinition } from './fields';
import type { ModelClassEvents, ModelEmitArgs, ModelEvents, ModelListener } from './listeners';
import type { ModelConstructor, SchemaDefinition } from './inference';
import type { ModelHooks } from './hooks';
import type { Relation } from './relations/Relation';
import type { TimestampFieldValue, TimestampsDefinition } from './timestamps';

const modelsWithMintedCollections = new WeakSet();

export type Key = string | number | Record<string, string | number>;

export type ModelCloneOptions = Partial<{
    clean: boolean;
    clones: WeakMap<Model, Model>;
    constructors: WeakMap<typeof Model, typeof Model> | [typeof Model, typeof Model][];
}>;

export type ModelCastAttributeOptions = {
    field?: string;
    definition?: BootedFieldDefinition;
    malformedAttributes?: Record<string, string[]>;
};

export class Model {

    public static collection: string;
    public static primaryKey: string = 'id';
    public static timestamps: TimestampsDefinition;
    public static fields: FieldsDefinition;
    public static modelName: string;
    public static classFields: string[] = [];
    public static relations: string[] = [];
    public static hooks: ModelHooks = {};
    public static __attributeGetters = new Map<string, () => unknown>();
    public static __attributeSetters = new Map<string, (value: unknown) => void>();

    private static instances: WeakMap<typeof Model, Model> = new WeakMap();
    private static pureInstances: WeakMap<typeof Model, Model> = new WeakMap();
    private static bootedModels: WeakMap<typeof Model, true> = new WeakMap();
    private static engines: WeakMap<typeof Model, Engine> = new WeakMap();
    private static ignoringTimestamps: WeakMap<Model | typeof Model, true> = new WeakMap();
    private static fieldAliases: Record<string, string> = {};

    public static boot<T extends Model>(this: ModelConstructor<T>, name?: string): void {
        ensureInverseRelationsBooted();

        const fieldDefinitions: BootedFieldsDefinition = {};

        this.bootedModels.set(this, true);

        this.modelName = this.bootModelName(name);
        this.collection = this.bootCollection();
        this.timestamps = this.bootTimestamps(this.timestamps, fieldDefinitions);

        const { fields, fieldAliases } = this.bootFields(
            this.fields,
            this.primaryKey,
            this.timestamps,
            fieldDefinitions,
        );

        this.fields = fields;
        this.fieldAliases = fieldAliases;

        const { classFields, relations, attributeGetters, attributeSetters } = this.bootClassDefinitions();

        this.classFields = classFields;
        this.relations = relations;
        this.__attributeGetters = attributeGetters;
        this.__attributeSetters = attributeSetters;

        const hooks = this.bootHooks(this.hooks);

        this.hooks = hooks;
    }

    public static ensureBooted<T extends Model>(this: ModelConstructor<T>): void {
        if (this.bootedModels.has(this)) {
            return;
        }

        this.boot();
    }

    public static async updateSchema(schema: SchemaDefinition | ModelConstructor): Promise<void> {
        await this.performSchemaUpdate(schema);

        await emitModelEvent(this, 'schema-updated', schema);
    }

    public static create<T extends Model>(this: ModelConstructor<T>, attributes: Attributes = {}): Promise<T> {
        const model = new this(attributes);

        return model.save();
    }

    public static createFromEngineDocument<T extends Model>(
        this: ModelConstructor<T>,
        id: Key,
        document: EngineDocument,
    ): Promise<T> {
        return this.instance().createFromEngineDocument(id, document);
    }

    public static createManyFromEngineDocuments<T extends Model>(
        this: ModelConstructor<T>,
        documents: Record<string, EngineDocument>,
    ): Promise<T[]> {
        return this.instance().createManyFromEngineDocuments(documents);
    }

    public static async findOrFail<T extends Model>(this: ModelConstructor<T>, id: Key): Promise<T> {
        const instance = await this.find(id);

        return instance ?? fail(`Failed getting required model ${id}`);
    }

    public static async find<T extends Model>(this: ModelConstructor<T>, id: Key): Promise<T | null> {
        this.ensureBooted();

        try {
            const document = await this.requireEngine().readOne(this.collection, this.instance().serializeKey(id));
            const instance = await this.createFromEngineDocument(id, document);

            return instance;
        } catch (error) {
            return null;
        }
    }

    public static async all<T extends Model>(this: ModelConstructor<T>, filters?: EngineFilters): Promise<T[]> {
        this.ensureBooted();

        const engine = this.requireEngine();
        const documents = await engine.readMany(this.collection, filters);
        const models = await this.createManyFromEngineDocuments(documents);

        return models as T[];
    }

    public static async first<T extends Model>(this: ModelConstructor<T>, filters?: EngineFilters): Promise<T | null> {
        // TODO implement limit 1
        const [model] = await this.all(filters);

        return model || null;
    }

    public static newInstance<T extends Model>(
        this: ModelConstructor<T>,
        ...params: ConstructorParameters<ModelConstructor<T>>
    ): T {
        return this.instance().newInstance(...params);
    }

    public static on<TModel extends Model, TEvent extends keyof ModelEvents | keyof ModelClassEvents>(
        this: ModelConstructor<TModel>,
        event: TEvent,
        listener: ModelListener<TModel, TEvent>,
    ): () => void {
        return registerModelListener(this, event, listener);
    }

    public static instance<T extends Model>(this: ModelConstructor<T>): T {
        if (!this.instances.has(this)) {
            this.instances.set(this, new this());
        }

        return this.instances.get(this) as T;
    }

    public static hasAutomaticTimestamp(timestamp: TimestampFieldValue): boolean {
        return (this.timestamps as TimestampFieldValue[]).indexOf(timestamp) !== -1;
    }

    public static hasAutomaticTimestamps(): boolean {
        return (this.timestamps as TimestampFieldValue[]).length > 0;
    }

    public static getEngine(): Engine | undefined {
        return this.engines.get(this) ?? getEngine();
    }

    public static getFinalEngine(): Engine | undefined {
        const engine = this.getEngine();

        return engine && extractFinalEngine(engine);
    }

    public static requireEngine<T extends Engine = Engine>(): T {
        return (this.engines.get(this) as T) ?? requireEngine<T>();
    }

    public static requireFinalEngine<T extends Engine = Engine>(): T {
        return extractFinalEngine(this.requireEngine()) as T;
    }

    public static setEngine(engine?: Engine): void {
        if (!engine) {
            this.engines.delete(this);

            return;
        }

        this.engines.set(this, engine);
    }

    public static withEngine<T>(this: T, engine: Engine): T;
    public static withEngine<T>(engine: Engine, operation: () => T): T;
    public static withEngine<T>(engine: Engine, operation: () => Promise<T>): Promise<T>;
    public static withEngine<TThis extends ModelConstructor, TResult>(
        this: TThis,
        engine: Engine,
        operation?: () => TResult | Promise<TResult>,
    ): TResult | Promise<TResult> | TThis {
        return withEngineImpl({
            target: this,
            getTargetEngine: () => this.engines.get(this),
            engine,
            operation,
        });
    }

    public static async withCollection<Result>(
        collection: string | undefined | (() => Result | Promise<Result>) = '',
        operation?: () => Result | Promise<Result>,
    ): Promise<Result> {
        const oldCollection = this.collection;

        if (typeof collection !== 'string') {
            operation = collection;
            collection = '';
        }

        if (!operation) {
            throw new SoukaiError(
                'Invalid method given to withCollection (this is an internal error, please report this bug)',
            );
        }

        this.collection = collection || oldCollection;

        try {
            const result = await operation();

            return result;
        } finally {
            this.collection = oldCollection;
        }
    }

    public static async withoutTimestamps<T>(operation: () => Promise<T>): Promise<T> {
        this.ignoringTimestamps.set(this, true);

        return tap(await operation(), () => this.ignoringTimestamps.delete(this));
    }

    protected static pureInstance<T extends Model>(this: ModelConstructor<T>): T {
        if (!this.pureInstances.has(this)) {
            this.pureInstances.set(this, new this({ __pureInstance: true }));
        }

        return this.pureInstances.get(this) as T;
    }

    protected static bootModelName(name?: string): string {
        const modelNameDescriptor = Object.getOwnPropertyDescriptor(this, 'modelName');

        return modelNameDescriptor?.value ?? name ?? this.name;
    }

    protected static bootCollection(): string {
        let modelClass = this;

        while (
            modelClass !== Model &&
            // eslint-disable-next-line no-prototype-builtins
            (!modelClass.hasOwnProperty('collection') || modelsWithMintedCollections.has(modelClass))
        ) {
            modelClass = Object.getPrototypeOf(modelClass);
        }

        if (modelClass === Model) {
            modelsWithMintedCollections.add(this);
        }

        return modelClass.collection ?? this.pureInstance().getDefaultCollection();
    }

    protected static bootTimestamps(
        timestamps: TimestampFieldValue[] | boolean | undefined,
        fieldDefinitions: BootedFieldsDefinition,
    ): TimestampFieldValue[] {
        if (typeof timestamps !== 'boolean' && typeof timestamps !== 'undefined' && !Array.isArray(timestamps)) {
            throw new InvalidModelDefinition(this.modelName, 'Invalid timestamps definition');
        }

        if (timestamps === false) {
            return [];
        }

        if (!Array.isArray(timestamps)) {
            timestamps = TIMESTAMP_FIELDS;
        }

        const invalidField = timestamps.find((field) => !TIMESTAMP_FIELDS.includes(field));

        if (invalidField) {
            throw new InvalidModelDefinition(this.modelName, `Invalid timestamp field defined (${invalidField})`);
        }

        for (const field of timestamps) {
            fieldDefinitions[field] = { type: FieldType.Date, required: false };
        }

        return timestamps;
    }

    protected static bootFields(
        fields: FieldsDefinition | undefined,
        primaryKey: string,
        timestamps: TimestampFieldValue[],
        fieldDefinitions: BootedFieldsDefinition,
    ): { fields: BootedFieldsDefinition; fieldAliases: Record<string, string> } {
        if (typeof fields === 'undefined') {
            fieldDefinitions[primaryKey] = {
                type: FieldType.Key,
                required: false,
            };

            return {
                fields: fieldDefinitions,
                fieldAliases: {},
            };
        }

        const fieldAliases: Record<string, string> = {};

        for (const [field, definition] of Object.entries(fields)) {
            if (!objectHasOwnProperty(fields, field)) {
                continue;
            }

            const bootedDefinition = (fieldDefinitions[field] = bootFieldDefinition(this.modelName, field, definition));

            if (bootedDefinition.alias) {
                fieldAliases[field] = bootedDefinition.alias;
                fieldAliases[bootedDefinition.alias] = field;
            }

            if (
                timestamps.includes(field as TimestampFieldValue) &&
                (bootedDefinition.type !== FieldType.Date || bootedDefinition.required)
            ) {
                throw new InvalidModelDefinition(
                    this.modelName,
                    `Field ${field} definition must be type Date and not required ` +
                        'because it is used an automatic timestamp. ' +
                        'Learn more at https://soukai.js.org/guide/defining-models.html#automatic-timestamps',
                );
            }
        }

        if (!(primaryKey in fieldDefinitions)) {
            fieldDefinitions[primaryKey] = {
                type: FieldType.Key,
                required: false,
            };
        }

        return {
            fields: fieldDefinitions,
            fieldAliases,
        };
    }

    protected static bootClassDefinitions(): {
        classFields: string[];
        relations: string[];
        attributeGetters: Map<string, () => unknown>;
        attributeSetters: Map<string, (value: unknown) => void>;
        } {
        const instance = this.pureInstance();
        const builtInClassFields = ['_engine', '_recentlyDeletedPrimaryKey'];
        const classFields: string[] = Object.getOwnPropertyNames(instance).concat(builtInClassFields);
        const relations: string[] = [];
        const attributeGetters: Map<string, () => unknown> = new Map<string, () => unknown>();
        const attributeSetters: Map<string, (value: unknown) => void> = new Map<string, (value: unknown) => void>();

        let prototype = Object.getPrototypeOf(instance);
        while (prototype !== Model.prototype) {
            if (prototype.constructor.classFields) classFields.push(...prototype.constructor.classFields);

            for (const [p, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
                const property = p as keyof typeof instance & string;

                if (typeof descriptor.value !== 'function') continue;

                if (property.endsWith('Relationship')) relations.push(property.slice(0, -12));
                else if (property.match(/get.+Attribute/))
                    attributeGetters.set(
                        stringToCamelCase(property.slice(3, -9)),
                        instance[property] as unknown as () => unknown,
                    );
                else if (property.match(/set.+Attribute/))
                    attributeSetters.set(
                        stringToCamelCase(property.slice(3, -9)),
                        instance[property] as unknown as () => unknown,
                    );
            }

            prototype = Object.getPrototypeOf(prototype);
        }

        return {
            classFields: arrayUnique(classFields),
            relations: arrayUnique(relations),
            attributeGetters,
            attributeSetters,
        };
    }

    protected static bootHooks(hooks?: ModelHooks): ModelHooks {
        return hooks ?? {};
    }

    protected static async performSchemaUpdate(schema: SchemaDefinition | ModelConstructor): Promise<void> {
        const primaryKey = schema.primaryKey ?? 'id';
        const fieldDefinitions: BootedFieldsDefinition = {};
        const timestamps = this.bootTimestamps(schema.timestamps, fieldDefinitions);
        const hooks = this.bootHooks(schema.hooks);
        const { fields, fieldAliases } = this.bootFields(schema.fields, primaryKey, timestamps, fieldDefinitions);

        this.primaryKey = primaryKey;
        this.timestamps = timestamps;
        this.hooks = hooks;
        this.fields = fields;
        this.fieldAliases = fieldAliases;
    }

    // TODO this should be optional (but it's too annoying to use)
    declare public id: string;
    declare protected _exists: boolean;
    declare protected _wasRecentlyCreated: boolean;
    declare protected _proxy: this;
    declare protected _attributes: Attributes;
    declare protected _originalAttributes: Attributes;
    declare protected _dirtyAttributes: Attributes;
    declare protected _malformedDocumentAttributes: Record<string, string[]>;
    declare protected _relations: { [relation: string]: Relation };

    declare private _engine?: Engine;
    declare private _recentlyDeletedPrimaryKey?: Key | null;

    constructor(attributes: Attributes = {}, exists: boolean = false) {
        // We need to do this in order to get a pure instance during boot; that is an instance that is not a proxy.
        // This is necessary in order to obtain information about the class definition without being polluted by magic
        // accessors, for example class fields.
        if ('__pureInstance' in attributes) {
            return;
        }

        this.static().ensureBooted();
        this.initializeProxy();
        this.initialize(attributes, exists);

        return this._proxy;
    }

    public static(property: 'fields'): BootedFieldsDefinition;
    public static(property: 'timestamps'): TimestampFieldValue[];
    public static<T extends typeof Model>(): T;
    public static<T extends typeof Model, K extends keyof T>(property: K): T[K];
    public static<T extends typeof Model, K extends keyof T>(property?: K): T | T[K] {
        const constructor = this.constructor as T;

        if (!property) {
            return constructor;
        }

        return constructor[property];
    }

    public newInstance<T extends Model>(this: T, ...params: ConstructorParameters<ModelConstructor<T>>): T {
        const constructor = this.constructor as ModelConstructor<T>;

        return new constructor(...params);
    }

    public async fresh(): Promise<this> {
        const primaryKey = this.getPrimaryKey();
        const freshInstance = primaryKey ? await this.static<ModelConstructor<this>>().find(primaryKey) : null;

        if (!freshInstance)
            throw new SoukaiError(
                `Couldn't get fresh instance for ${this.static('modelName')} with id '${primaryKey}'`,
            );

        return freshInstance;
    }

    public update(attributes: Attributes = {}): Promise<this> {
        // TODO validate protected fields (e.g. id)

        attributes = this.castAttributes(attributes, this.static('fields'));

        for (const field in attributes) {
            this.setAttribute(field, attributes[field]);
        }

        return this.save();
    }

    public hasRelation(relation: string): boolean {
        return this.static('relations').indexOf(relation) !== -1;
    }

    public getRelation<T extends Relation = Relation>(relation: string): T | null {
        return (this._relations[relation] as T) || null;
    }

    public requireRelation<T extends Relation = Relation>(relation: string): T {
        return (
            (this._relations[relation] as T) ?? fail(SoukaiError, `Attempting to use undefined ${relation} relation.`)
        );
    }

    public getEngine(): Engine | undefined {
        return this._engine ?? this.static().getEngine();
    }

    public getFinalEngine(): Engine | undefined {
        const engine = this.getEngine();

        return engine && extractFinalEngine(engine);
    }

    public requireEngine<T extends Engine>(): T {
        return (this._engine as T) ?? this.static().requireEngine<T>();
    }

    public requireFinalEngine<T extends Engine>(): T {
        return extractFinalEngine(this.requireEngine()) as T;
    }

    public async loadRelation<T extends Model | null | Model[] = Model | null | Model[]>(relation: string): Promise<T> {
        const relationInstance = this.requireRelation(relation);
        const related = await relationInstance.relatedClass.withEngine(this.requireEngine(), () =>
            relationInstance.load());

        this.emit('relation-loaded', relationInstance);

        return related as T;
    }

    public async loadRelationIfUnloaded<T extends Model | null | Model[] = Model | null | Model[]>(
        relation: string,
    ): Promise<T> {
        const relationInstance = this.requireRelation(relation);

        return relationInstance.loaded ? (relationInstance.getLoadedModels() as T) : this.loadRelation(relation);
    }

    public unloadRelation(relation: string): void {
        this.requireRelation(relation).unload();
    }

    public getRelationModel<T extends Model>(relation: string): T | null {
        const relationInstance = this.requireRelation(relation);

        if (relationInstance instanceof MultiModelRelation) {
            // eslint-disable-next-line no-console
            console.warn(
                `You're getting a single model from the multi-model '${relation}' relation ` +
                    `in the '${this.static('modelName')}' model.`,
            );

            return (relationInstance.related?.[0] ?? null) as T | null;
        }

        return (relationInstance.related ?? null) as T | null;
    }

    public getRelationModels<T extends Model>(relation: string): T[] | null {
        const relationInstance = this.requireRelation(relation);

        if (relationInstance instanceof SingleModelRelation) {
            return relationInstance.related ? ([relationInstance.related] as T[]) : null;
        }

        return (relationInstance.related ?? null) as T[] | null;
    }

    public setRelationModel(relation: string, model: Model | null): void {
        const relationInstance = this.requireRelation(relation);

        if (relationInstance instanceof MultiModelRelation) {
            // eslint-disable-next-line no-console
            console.warn(
                `You're setting a single model for the multi-model '${relation}' relation ` +
                    `in the '${this.static('modelName')}' model.`,
            );

            relationInstance.related = [model];

            return;
        }

        relationInstance.related = model;
    }

    public setRelationModels(relation: string, models: Model[] | null): void {
        const relationInstance = this.requireRelation(relation);
        const getModels = () => {
            if (models === null || relationInstance instanceof MultiModelRelation) {
                return models;
            }

            if (models.length > 0) {
                throw new SoukaiError(
                    'Can\'t set multiple models for SingleModelRelation, use setRelationModel instead',
                );
            }

            return models[0] ?? null;
        };

        relationInstance.related = getModels();
    }

    public isRelationLoaded(relation: string): boolean {
        return this.requireRelation(relation).loaded;
    }

    public hasAttribute(field: string): boolean {
        const parts = field.split('.');
        let value = removeUndefinedAttributes(this._attributes, this.static('fields'));

        for (const part of parts) {
            if (!isObject(value) || !(part in value)) return false;

            value = value[part] as Attributes;
        }

        return value !== undefined;
    }

    public setAttribute(field: string, value: unknown): void {
        const alias = this.static().fieldAliases[field];
        const previousValue = this.getAttribute(field);

        this.hasAttributeSetter(field) ? this.callAttributeSetter(field, value) : this.setAttributeValue(field, value);

        if (alias && this.attributeValueChanged(this.getAttribute(alias), value)) {
            this.setAttribute(alias, value);
        }

        this.attributeValueChanged(previousValue, value) && this.emit('modified', field);
    }

    public setAttributeValue(field: string, value: unknown): void {
        // TODO implement deep setter

        this._attributes[field] = value = this.castAttribute(value, { definition: this.static('fields')[field] });

        this.markAttributeDirty(field, this._originalAttributes[field], value)
            ? (this._dirtyAttributes[field] = value)
            : delete this._dirtyAttributes[field];
    }

    public hasAttributeSetter(field: string): boolean {
        return this.static('__attributeSetters').has(field) || !!this.static('fields')[field]?.set;
    }

    public callAttributeSetter(field: string, value: unknown): void {
        const setter = this.static('__attributeSetters').get(field) ?? this.static('fields')[field]?.set;

        return setter?.call(this, value);
    }

    public getOriginalAttribute<T = unknown>(field: string): T {
        return this._originalAttributes[field];
    }

    public getDeletedPrimaryKey(): Key | null {
        return this._recentlyDeletedPrimaryKey ?? null;
    }

    public setOriginalAttribute(field: string, value: unknown): void {
        value = this.castAttribute(value, { definition: this.static('fields')[field] });

        this._originalAttributes[field] = value;
        this._attributes[field] = value;

        delete this._dirtyAttributes[field];
    }

    public setAttributes(attributes: Attributes): void {
        for (const [field, value] of Object.entries(attributes)) {
            this.setAttribute(field, value);
        }
    }

    public getMalformedDocumentAttributes(): Record<string, string[]> {
        return this._malformedDocumentAttributes;
    }

    public setMalformedDocumentAttributes(malformedAttributes: Record<string, string[]>): void {
        this._malformedDocumentAttributes = malformedAttributes;
    }

    public setEngine(engine?: Engine): void {
        if (!engine) {
            delete this._engine;

            return;
        }

        this._engine = engine;
    }

    public withEngine(engine: Engine): this;
    public withEngine<T>(engine: Engine, operation: (model: this) => T): T;
    public withEngine<T>(engine: Engine, operation: (model: this) => Promise<T>): Promise<T>;
    public withEngine<T>(engine: Engine, operation?: (model: this) => T | Promise<T>): T | Promise<T> | this {
        return withEngineImpl({
            target: this,
            getTargetEngine: () => this._engine,
            operation: operation && (() => operation(this)),
            engine,
        });
    }

    public async withoutTimestamps<T>(operation: () => Promise<T>): Promise<T> {
        this.static().ignoringTimestamps.set(this, true);

        return tap(await operation(), () => this.static().ignoringTimestamps.delete(this));
    }

    public getAttribute<T = unknown>(field: string, includeUndefined: boolean = false): T {
        return this.hasAttributeGetter(field)
            ? (this.callAttributeGetter(field) as T)
            : this.getAttributeValue(field, includeUndefined);
    }

    public getAttributeValue<T = unknown>(field: string, includeUndefined: boolean = false): T {
        const fields = field.split('.');
        let value = this.getAttributes(includeUndefined);

        while (fields.length > 0) {
            const fieldValue = value[fields.shift() as string];

            if (!isObject(fieldValue)) return fieldValue as T;

            value = fieldValue;
        }

        return value as T;
    }

    public getAttributes(includeUndefined: boolean = false): Attributes {
        return includeUndefined
            ? objectDeepClone(this._attributes)
            : (removeUndefinedAttributes(this._attributes, this.static('fields')) as Attributes);
    }

    public hasAttributeGetter(field: string): boolean {
        return this.static('__attributeGetters').has(field) || !!this.static('fields')[field]?.get;
    }

    public callAttributeGetter(field: string): unknown {
        const getter = this.static('__attributeGetters').get(field) ?? this.static('fields')[field]?.get;

        return getter?.call(this);
    }

    public unsetAttribute(field: string): void {
        // TODO implement deep unsetter
        // TODO validate protected fields (e.g. id)
        if (!objectHasOwnProperty(this._attributes, field)) {
            return;
        }

        field in this.static('fields') ? (this._attributes[field] = undefined) : delete this._attributes[field];

        this.markAttributeDirty(field, this._originalAttributes[field], undefined)
            ? (this._dirtyAttributes[field] = undefined)
            : delete this._dirtyAttributes[field];
    }

    public hasIncompleteAttributes(): boolean {
        try {
            validateRequiredAttributes(this._attributes, this.static('fields'));

            return false;
        } catch (error) {
            return true;
        }
    }

    public is(another: this): boolean {
        return this.getPrimaryKey() === another.getPrimaryKey();
    }

    public isDirty(field?: string): boolean {
        return field ? field in this._dirtyAttributes : Object.values(this._dirtyAttributes).length > 0;
    }

    public cleanDirty(): void {
        this._originalAttributes = objectDeepClone(this._attributes);
        this._dirtyAttributes = {};
        this._exists = true;
    }

    public reset(): void {
        delete this._attributes[this.static('primaryKey')];
        this._exists = false;
        this._dirtyAttributes = objectDeepClone(this._attributes);
    }

    public getPrimaryKey(): Key | null {
        return this._attributes[this.static('primaryKey')] ?? null;
    }

    public getSerializedPrimaryKey(): string | null {
        const primaryKey = this.getPrimaryKey();

        return primaryKey ? this.serializeKey(primaryKey) : null;
    }

    public async delete(): Promise<this> {
        if (!this._exists) {
            return this;
        }

        await this.performDelete();
        await this.emit('deleted');

        return this;
    }

    public async save(): Promise<this> {
        validateRequiredAttributes(this._attributes, this.static('fields'));

        const existed = this.exists();

        if (existed && !this.isDirty()) return this;

        await this.static('hooks').beforeSave?.call(this);
        await this.beforeSave();
        await this.performSave();
        await this.static('hooks').afterSave?.call(this);
        await this.afterSave();
        await this.emit(existed ? 'updated' : 'created');

        return this;
    }

    public fixMalformedAttributes(): void {
        this.performMalformedAttributeFixes();

        this._malformedDocumentAttributes = {};
    }

    /**
     * Set the `updatedAt` attribute to the current time.
     */
    public touch(): void {
        this.setAttribute(TimestampField.UpdatedAt, new Date());
    }

    public setExists(exists: boolean): void {
        this._exists = exists;
    }

    public exists(): boolean {
        return this._exists;
    }

    public wasRecentlyCreated(): boolean {
        return this._wasRecentlyCreated;
    }

    public wasRecentlyDeleted(): boolean {
        return !!this._recentlyDeletedPrimaryKey;
    }

    public clone(options?: ModelCloneOptions): this;
    public clone<T extends Model>(options?: ModelCloneOptions): T;
    public clone(options: ModelCloneOptions = {}): this {
        const clones = options.clones ?? new WeakMap();

        if (clones.has(this)) return clones.get(this) as this;

        const constructorsOption = options.constructors;
        const constructors = Array.isArray(constructorsOption)
            ? tap(new WeakMap(), (map) => {
                constructorsOption.forEach(([original, substitute]) => map.set(original, substitute));
            })
            : (constructorsOption ?? new WeakMap<typeof Model, typeof Model>());
        const classConstructor = constructors.get(this.static()) ?? this.static();
        const clone = new classConstructor(this.getAttributes());

        clones.set(this, clone);

        for (const [relationName, relationInstance] of Object.entries(this._relations)) {
            clone._relations[relationName] = tap(
                relationInstance.clone({ clones, constructors }),
                (relationClone) => (relationClone.parent = clone),
            );
        }

        options.clean && clone.cleanDirty();

        return clone;
    }

    protected initialize(attributes: Attributes, exists: boolean): void {
        this._exists = exists;
        this._wasRecentlyCreated = false;

        this.initializeAttributes(attributes, exists);
        this.initializeRelations();
    }

    protected initializeProxy(): void {
        this._proxy = new Proxy(this, {
            get(target, property, receiver) {
                if (
                    typeof property !== 'string' ||
                    property in target ||
                    target.static('classFields').indexOf(property) !== -1
                )
                    return Reflect.get(target, property, receiver);

                if (target.hasRelation(property))
                    return target._proxy.isRelationLoaded(property)
                        ? target._proxy.requireRelation(property).related
                        : undefined;

                if (property.startsWith('related')) {
                    const relation = stringToCamelCase(property.substr(7));

                    if (target._proxy.hasRelation(relation)) return target._relations[relation];
                }

                return target._proxy.getAttribute(property);
            },
            set(target, property, value, receiver) {
                if (
                    typeof property !== 'string' ||
                    property in target ||
                    target.static('classFields').indexOf(property) !== -1
                )
                    return Reflect.set(target, property, value, receiver);

                if (target._proxy.hasRelation(property)) {
                    target._proxy.requireRelation(property).related = value;

                    return true;
                }

                target._proxy.setAttribute(property, value);

                return true;
            },
            deleteProperty(target, property) {
                if (typeof property !== 'string' || property in target) return Reflect.deleteProperty(target, property);

                if (target._proxy.hasRelation(property)) {
                    target._proxy.unloadRelation(property);

                    return true;
                }

                if (!(property in target._attributes) || target.static('classFields').indexOf(property) !== -1)
                    return Reflect.deleteProperty(target, property);

                target._proxy.unsetAttribute(property);

                return true;
            },
        });
    }

    protected initializeAttributes(attributes: Attributes, exists: boolean): void {
        const fields = this.static('fields');

        this._malformedDocumentAttributes = {};
        this._attributes = objectDeepClone(attributes);
        this._attributes = this.castAttributes(
            validateAttributes(this._attributes, fields),
            fields,
            this._malformedDocumentAttributes,
        );

        for (const [field, alias] of Object.entries(this.static().fieldAliases)) {
            const value = this._attributes[field] ?? this._attributes[alias];

            this._attributes[field] = value;
            this._attributes[alias] = value;
        }

        this._originalAttributes = exists ? objectDeepClone(this._attributes) : {};
        this._dirtyAttributes = exists ? {} : objectDeepClone(this._attributes);

        delete this._malformedDocumentAttributes[this.static('primaryKey')];
    }

    protected initializeRelations(): void {
        this._relations = this.static('relations').reduce(
            (relations, name) => {
                const proxy = this._proxy as unknown as Record<string, () => Relation>;
                const relation = proxy[stringToCamelCase(name) + 'Relationship']?.() as Relation;

                relation.name = name;
                relations[name] = relation;

                return relations;
            },
            {} as Record<string, Relation>,
        );
    }

    protected getDefaultCollection(): string {
        return this.static('modelName').toLowerCase() + 's';
    }

    protected async createFromEngineDocument(id: Key, document: EngineDocument): Promise<this> {
        const attributes = await this.parseEngineDocumentAttributes(id, document);

        attributes[this.static('primaryKey')] = id;

        return this.newInstance(attributes, true);
    }

    protected async createManyFromEngineDocuments(documents: Record<string, EngineDocument>): Promise<this[]> {
        return Promise.all(
            Object.entries(documents).map(([id, document]) =>
                this.createFromEngineDocument(this.parseKey(id), document)),
        );
    }

    protected async beforeSave(): Promise<void> {
        const now = new Date();
        const ignoringTimestamps = this.static().ignoringTimestamps;

        if (!ignoringTimestamps.has(this) && !ignoringTimestamps.has(this.static())) {
            if (this.static().hasAutomaticTimestamp(TimestampField.CreatedAt))
                this.setAttribute(TimestampField.CreatedAt, this.getAttribute(TimestampField.CreatedAt) ?? now);

            if (this.static().hasAutomaticTimestamp(TimestampField.UpdatedAt)) {
                const updatedAt = this.isDirty(TimestampField.UpdatedAt)
                    ? this.getAttribute(TimestampField.UpdatedAt)
                    : now;

                this.setAttribute(TimestampField.UpdatedAt, updatedAt ?? now);
            }
        }
    }

    protected async performSave(): Promise<void> {
        const existed = this.exists();
        const id = await this.syncDirty();

        this._wasRecentlyCreated = this._wasRecentlyCreated || !existed;
        this._attributes[this.static('primaryKey')] = this.parseKey(id);
    }

    protected async afterSave(): Promise<void> {
        this.cleanDirty();

        await this.loadEmptyRelations();
    }

    protected async performDelete(): Promise<void> {
        const primaryKey = this.getPrimaryKey();
        const models = await this.getCascadeModels();

        await this.deleteModelsFromEngine(models);

        models.forEach((model) => model.reset());

        this._recentlyDeletedPrimaryKey = primaryKey;
    }

    protected performMalformedAttributeFixes(): void {
        const malformedFields = Object.keys(this._malformedDocumentAttributes);
        const isFieldMalformed = (field: string, definition: BootedFieldDefinition) => {
            if (definition.type === FieldType.Array) {
                return malformedFields.some((malformedField) => malformedField.startsWith(`${field}.`));
            }

            return field in this._malformedDocumentAttributes;
        };

        for (const [field, definition] of Object.entries(this.static('fields'))) {
            if (!isFieldMalformed(field, definition)) {
                continue;
            }

            this._dirtyAttributes[field] = this._attributes[field];
        }
    }

    protected async emit<T extends keyof ModelEvents>(...args: ModelEmitArgs<T>): Promise<void> {
        return emitModelEvent<T>(this, ...args);
    }

    protected async syncDirty(): Promise<string> {
        if (!this.exists()) {
            return this.requireEngine().create(
                this.static('collection'),
                this.toEngineDocument(),
                this.getSerializedPrimaryKey() || undefined,
            );
        }

        const updates = this.getDirtyEngineDocumentUpdates();
        const id = this.getSerializedPrimaryKey() as string;

        await this.requireEngine().update(this.static('collection'), id, updates);

        return id;
    }

    protected async getCascadeModels(): Promise<Model[]> {
        const relationPromises = this.static('relations')
            .map((relation) => this.requireRelation(relation))
            .filter((relation) => relation.enabled && relation.deleteStrategy === 'cascade')
            .map(async (relation) => {
                const relationModels = await relation.getModels();

                return relationModels.map((model) => model.getCascadeModels());
            });
        const modelPromises = await Promise.all(relationPromises);
        const models = await Promise.all(modelPromises.flat());

        return [...models.flat(), this].filter((model) => model.exists());
    }

    protected async deleteModelsFromEngine(models: Model[]): Promise<void> {
        // TODO cluster by collection and implement deleteMany
        const modelsData = models.map(
            (model) => [model.static('collection'), model.getSerializedPrimaryKey()] as [string, string],
        );

        await Promise.all(modelsData.map(([collection, id]) => this.requireEngine().delete(collection, id)));
    }

    /**
     * @deprecated use `reset` instead.
     */
    protected resetEngineData(): void {
        this.reset();
    }

    /**
     * Creates a relation when this model is referenced by one instance of another model.
     *
     * @param relatedClass - Related model class.
     * @param foreignKeyField - Name of the foreign key field in the related model.
     * @param localKeyField - Name of the local key field in the local model. Defaults to
     * the primary key name defined in the local model class.
     */
    protected hasOne<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): HasOneRelation {
        return new HasOneRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model references one instance of another model.
     *
     * @param relatedClass - Related model class.
     * @param foreignKeyField - Name of the foreign key field in the local model.
     * @param localKeyField - Name of the local key field in the related model. Defaults to
     * the primary key name defined in the related model class.
     */
    protected belongsToOne<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): BelongsToOneRelation {
        return new BelongsToOneRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model is referenced by multiple instances of another model.
     *
     * @param relatedClass - Related model class.
     * @param foreignKeyField - Name of the foreign key field in the related model.
     * @param localKeyField - Name of the local key field in the local model. Defaults to
     * the primary key name defined in the local model class.
     */
    protected hasMany<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): HasManyRelation {
        return new HasManyRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model references multiple instances of another model.
     *
     * @param relatedClass - Related model class.
     * @param foreignKeyField - Name of the foreign key field in the local model.
     * @param localKeyField - Name of the local key field in the related model. Defaults to
     * the primary key name defined in the related model class.
     */
    protected belongsToMany<T extends typeof Model>(
        relatedClass: T,
        foreignKeyField?: string,
        localKeyField?: string,
    ): BelongsToManyRelation {
        return new BelongsToManyRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    protected async loadEmptyRelations(): Promise<void> {
        const wasRecentlyCreated = this.wasRecentlyCreated();

        for (const relation of Object.values(this._relations)) {
            if (!relation.enabled || relation.loaded) {
                continue;
            }

            if (wasRecentlyCreated && relation instanceof HasManyRelation) {
                relation.related = [];

                continue;
            }

            if (wasRecentlyCreated && relation instanceof HasOneRelation) {
                relation.related = null;

                continue;
            }

            if (!relation.isEmpty()) {
                continue;
            }

            await relation.load();
        }
    }

    protected attributeValueChanged(originalValue: unknown, newValue: unknown): boolean {
        if (originalValue instanceof ModelKey) return toString(originalValue) !== toString(newValue);

        return !deepEquals(originalValue, newValue);
    }

    protected markAttributeDirty(field: string, originalValue: unknown, newValue: unknown): boolean {
        return this.attributeValueChanged(originalValue, newValue);
    }

    protected castAttributes(
        attributes: Attributes,
        definitions: BootedFieldsDefinition,
        malformedAttributes?: Record<string, string[]>,
        fieldPrefix: string = '',
    ): Attributes {
        const castedAttributes = {} as Record<string, unknown>;

        for (const field in attributes) {
            castedAttributes[field] = this.castAttribute(attributes[field], {
                field: fieldPrefix + field,
                malformedAttributes,
                definition: definitions[field],
            });
        }

        return castedAttributes;
    }

    protected castAttribute(
        value: unknown,
        { field, definition, malformedAttributes }: ModelCastAttributeOptions = {},
    ): unknown {
        if (isNullable(value)) {
            return value;
        }

        if (definition?.cast) {
            return definition.cast(value);
        }

        if (typeof definition === 'undefined') {
            switch (typeof value) {
                case 'object':
                    if (Array.isArray(value))
                        return value.map((attributeValue, index) =>
                            this.castAttribute(attributeValue, {
                                field: field && `${field}.${index}`,
                                malformedAttributes,
                            }));

                    if (value instanceof Date || value instanceof ModelKey) return value;

                    return toString(value);
                case 'symbol':
                case 'function':
                case 'undefined':
                    return undefined;
                default:
                    return value;
            }
        }

        switch (definition.type) {
            case FieldType.Date:
                if (!['string', 'number'].includes(typeof value) && !(value instanceof Date)) {
                    throw new SoukaiError(
                        `Invalid Date value (${value}) found in ${this.static('modelName')} ${this.getPrimaryKey()}.`,
                    );
                }

                return new Date(value as string | number | Date);
            case FieldType.Object:
                if (!isObject(value)) {
                    throw new SoukaiError(
                        `Invalid Object value (${value}) found in ${this.static('modelName')} ${this.getPrimaryKey()}.`,
                    );
                }

                return this.castAttributes(
                    value,
                    definition.fields as Record<string, BootedFieldDefinition>,
                    malformedAttributes,
                    field && `${field}.`,
                );
            case FieldType.Array:
                if (!Array.isArray(value)) {
                    throw new SoukaiError(
                        `Invalid Array value (${value}) found in ${this.static('modelName')} ${this.getPrimaryKey()}.`,
                    );
                }

                return value.map((attributeValue, index) =>
                    this.castAttribute(attributeValue, {
                        field: field && `${field}.${index}`,
                        definition: definition.items as BootedFieldDefinition,
                        malformedAttributes,
                    }));
            case FieldType.Boolean:
                return !!value;
            case FieldType.Number: {
                const number = parseFloat(value as string);

                if (isNaN(number)) {
                    throw new SoukaiError(
                        `Invalid Number value (${value}) found in ${this.static('modelName')} ${this.getPrimaryKey()}.`,
                    );
                }

                return number;
            }
            case FieldType.String:
                return toString(value);
            case FieldType.Key: {
                if (value instanceof ModelKey) return toString(value);

                if (field && malformedAttributes) {
                    const malformations = malformedAttributes[field] ?? [];

                    malformedAttributes[field] = [...malformations, 'malformed-key'];
                }

                return value;
            }
            default:
                return value;
        }
    }

    protected toEngineDocument(): EngineDocument {
        return removeUndefinedAttributes(this._attributes, this.static('fields')) as EngineDocument;
    }

    protected getDirtyEngineDocumentUpdates(): EngineUpdates {
        const updates = objectDeepClone(this._dirtyAttributes);

        for (const field in updates) {
            if (updates[field] !== undefined) {
                continue;
            }

            updates[field] = { $unset: true };
        }

        return updates as EngineUpdates;
    }

    protected async parseEngineDocumentAttributes(id: Key, document: EngineDocument): Promise<Attributes> {
        return { ...document };
    }

    protected serializeKey(key: Key): string {
        return toString(key);
    }

    protected parseKey(key: string): Key {
        return key;
    }

}

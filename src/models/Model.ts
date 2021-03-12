import {
    arrayUnique,
    deepEquals,
    isNullable,
    isObject,
    objectDeepClone,
    objectHasOwnProperty,
    stringToCamelCase,
    toString,
} from '@noeldemartin/utils';

import { requireEngine } from '@/engines';
import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import SoukaiError from '@/errors/SoukaiError';
import type { EngineDocument, EngineFilters, EngineUpdates } from '@/engines/Engine';

import {
    FieldType,
    TIMESTAMP_FIELDS,
    TimestampField,
    expandFieldDefinition,
} from './fields';
import { isModelBooted } from './registration';
import { removeUndefinedAttributes, validateAttributes, validateRequiredAttributes } from './attributes';
import BelongsToManyRelation from './relations/BelongsToManyRelation';
import BelongsToOneRelation from './relations/BelongsToOneRelation';
import HasManyRelation from './relations/HasManyRelation';
import HasOneRelation from './relations/HasOneRelation';
import type {
    BootedFieldDefinition,
    BootedFieldsDefinition,
    FieldsDefinition,
    TimestampFieldValue,
} from './fields';
import type { Constructor, MagicAttributes, ModelConstructor } from './inference';
import type { Attributes } from './attributes';
import type MultiModelRelation from './relations/MultiModelRelation';
import type Relation from './relations/Relation';
import type SingleModelRelation from './relations/SingleModelRelation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Key = any;

export type ModelInterface<T extends typeof Model> = MagicAttributes<T['fields']>;

export class Model {

    public static collection: string;

    public static primaryKey: string = 'id';

    public static timestamps: TimestampFieldValue[] | boolean;

    public static fields: FieldsDefinition;

    public static modelName: string;

    public static classFields: string[] = [];

    public static relations: string[] = [];

    private static instances = new WeakMap;
    private static pureInstances = new WeakMap;

    public static boot<T extends Model>(this: ModelConstructor<T>, name: string): void {
        const modelClass = this;
        const fieldDefinitions: BootedFieldsDefinition = {};

        // Validate collection
        if (typeof modelClass.collection === 'undefined') {
            modelClass.collection = name.toLowerCase() + 's';
        } else if (typeof modelClass.collection !== 'string') {
            throw new InvalidModelDefinition(name, 'Collection name not defined or invalid format');
        }

        // Validate timestamps
        if (typeof modelClass.timestamps === 'boolean' || typeof modelClass.timestamps === 'undefined') {
            if (typeof modelClass.timestamps === 'undefined' || modelClass.timestamps) {
                for (const field of TIMESTAMP_FIELDS) {
                    fieldDefinitions[field] = { type: FieldType.Date, required: false };
                }
                modelClass.timestamps = TIMESTAMP_FIELDS;
            } else {
                modelClass.timestamps = [];
            }
        } else if (Array.isArray(modelClass.timestamps)) {
            for (const field of modelClass.timestamps) {
                if (!TIMESTAMP_FIELDS.includes(field)) {
                    throw new InvalidModelDefinition(name, `Invalid timestamp field defined (${field})`);
                }

                fieldDefinitions[field] = { type: FieldType.Date, required: false };
            }
        } else {
            throw new InvalidModelDefinition(name, 'Invalid timestamps definition');
        }

        // Validate fields
        if (typeof this.fields !== 'undefined') {
            for (const field in this.fields) {
                if (objectHasOwnProperty(this.fields, field)) {
                    fieldDefinitions[field] = expandFieldDefinition(name, field, this.fields[field]);

                    if (
                        modelClass.timestamps.includes(field as TimestampFieldValue) && (
                            fieldDefinitions[field].type !== FieldType.Date ||
                            fieldDefinitions[field].required
                        )
                    ) {
                        throw new InvalidModelDefinition(
                            name,
                            `Field ${field} definition must be type Date and not required ` +
                            'because it is used an automatic timestamp. ' +
                            'Learn more at https://soukai.js.org/guide/defining-models.html#automatic-timestamps',
                        );
                    }
                }
            }
        }

        // Define primary key field
        if (!(modelClass.primaryKey in fieldDefinitions)) {
            fieldDefinitions[modelClass.primaryKey] = {
                type: FieldType.Key,
                required: false,
            };
        }

        // Obtain class definition information
        const instance = modelClass.pureInstance();
        const classFields: string[] = Object.getOwnPropertyNames(instance);
        const relations: string[] = [];

        let prototype = Object.getPrototypeOf(instance);
        while (prototype !== Model.prototype) {
            if (prototype.constructor.classFields)
                classFields.push(...prototype.constructor.classFields);

            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (
                    property.endsWith('Relationship') &&
                    typeof instance[property as keyof typeof instance] === 'function'
                ) {
                    relations.push(property.substring(0, property.length - 12));
                }
            }

            prototype = Object.getPrototypeOf(prototype);
        }

        this.classFields = arrayUnique(classFields);
        this.relations = arrayUnique(relations);
        this.fields = fieldDefinitions;
        modelClass.modelName = name;
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

    public static find<T extends Model>(this: ModelConstructor<T>, id: Key): Promise<T | null> {
        this.ensureBooted();

        return requireEngine()
            .readOne(this.collection, this.instance().serializeKey(id))
            .then(document => this.createFromEngineDocument(id, document))
            .catch(() => null);
    }

    public static async all<T extends Model>(this: ModelConstructor<T>, filters?: EngineFilters): Promise<T[]> {
        this.ensureBooted();

        const engine = requireEngine();
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
    ): T{
        return this.instance().newInstance(...params);
    }

    public static schema<T extends Model, F extends FieldsDefinition>(
        this: ModelConstructor<T>,
        fields: F,
    ): Constructor<MagicAttributes<F>> & ModelConstructor<T> {
        const ModelClass = this as typeof Model;

        return class extends ModelClass {

            static fields = fields;

        } as unknown as Constructor<MagicAttributes<F>> & ModelConstructor<T>;
    }

    public static instance<T extends Model>(this: ModelConstructor<T>): T {
        if (!this.instances.has(this)) {
            this.instances.set(this, new this());
        }

        return this.instances.get(this);
    }

    protected static pureInstance<T extends Model>(this: ModelConstructor<T>): T {
        if (!this.pureInstances.has(this)) {
            this.pureInstances.set(this, new this({ __pureInstance: true }));
        }

        return this.pureInstances.get(this);
    }

    protected static ensureBooted<T extends Model>(this: ModelConstructor<T>): void {
        if (!isModelBooted(this)) {
            console.log('non booted model', this);

            throw new SoukaiError(
                'Model has not been booted (did you forget to call loadModel?) ' +
                'Learn more at https://soukai.js.org/guide/defining-models.html',
            );
        }
    }

    protected _exists!: boolean;
    protected _wasRecentlyCreated!: boolean;
    protected _proxy!: Model;
    protected _attributes!: Attributes;
    protected _originalAttributes!: Attributes;
    protected _dirtyAttributes!: Attributes;
    protected _relations!: { [relation: string]: Relation };

    constructor(attributes: Attributes = {}, exists: boolean = false) {
        // We need to do this in order to get a pure instance during boot; that is an instance that is not a proxy.
        // This is necessary in order to obtain information about the class definition without being polluted by magic
        // accessors, for example class fields.
        if ('__pureInstance' in attributes) {
            return;
        }

        this.static().ensureBooted();
        this.initialize(attributes, exists);

        return this._proxy;
    }

    public static(): ModelConstructor<this>;
    public static(property: 'fields'): BootedFieldsDefinition;
    public static(property: 'timestamps'): TimestampFieldValue[];
    public static<T extends keyof ModelConstructor<this>>(property: T): ModelConstructor<this>[T];
    public static<T extends keyof ModelConstructor<this>>(
        property?: T,
    ): ModelConstructor<this> | ModelConstructor<this>[T] {
        const constructor = this.constructor as ModelConstructor<this>;

        return property
            ? constructor[property] as ModelConstructor<this>[T]
            : constructor;
    }

    public newInstance<T extends Model>(this: T, ...params: ConstructorParameters<ModelConstructor<T>>): T {
        const constructor = this.constructor as ModelConstructor<T>;

        return new constructor(...params);
    }

    public async fresh(): Promise<this> {
        const primaryKey = this.getPrimaryKey();
        const freshInstance = await this.static().find(primaryKey);

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

        if (this.hasAutomaticTimestamp(TimestampField.UpdatedAt)) {
            this.touch();
        }

        return this.save();
    }

    public hasRelation(relation: string): boolean {
        return this.static('relations').indexOf(relation) !== -1;
    }

    public getRelation<T extends Relation = Relation>(relation: string): T | null {
        return this._relations[relation] as T || null;
    }

    public loadRelation<T extends Model | null | Model[] = Model | null | Model[]>(
        relation: string,
    ): Promise<T> {
        return this.requireRelation(relation).resolve() as Promise<T>;
    }

    public async loadRelationIfUnloaded<T extends Model | null | Model[] = Model | null | Model[]>(
        relation: string,
    ): Promise<T> {
        return this.isRelationLoaded(relation)
            ? this.getRelationModels<T>(relation)
            : this.loadRelation<T>(relation);
    }

    public unloadRelation(relation: string): void {
        this.requireRelation(relation).unload();
    }

    public getRelationModels<T extends Model | null | Model[] = Model | null | Model[]>(relation: string): T {
        return this.requireRelation(relation).related as T;
    }

    public setRelationModels(relation: string, models: null | Model | Model[]): void {
        this.requireRelation(relation).related = models;
    }

    public isRelationLoaded(relation: string): boolean {
        return this.requireRelation(relation).loaded;
    }

    public hasAttribute(field: string): boolean {
        const parts = field.split('.');
        let value = removeUndefinedAttributes(this._attributes, this.static('fields'));

        for (const part of parts) {
            if (!isObject(value) || !(part in value))
                return false;

            value = value[part] as Attributes;
        }

        return value !== undefined;
    }

    public setAttribute(field: string, value: unknown): void {
        // TODO implement deep setter

        value = this.castAttribute(value, this.static('fields')[field]);

        this._attributes[field] = value;

        delete this._dirtyAttributes[field];

        if (!deepEquals(this._originalAttributes[field], value)) {
            this._dirtyAttributes[field] = value;
        }

        if (this.hasAutomaticTimestamp(TimestampField.UpdatedAt) && field !== TimestampField.UpdatedAt) {
            this.touch();
        }
    }

    public setAttributes(attributes: Attributes): void {
        for (const [field, value] of Object.entries(attributes)) {
            this.setAttribute(field, value);
        }
    }

    public getAttribute<T = unknown>(field: string, includeUndefined: boolean = false): T {
        const fields = field.split('.');
        let value = this.getAttributes(includeUndefined);

        while (fields.length > 0) {
            const fieldValue = value[fields.shift() as string];

            if (!isObject(fieldValue))
                return fieldValue as T;

            value = fieldValue;
        }

        return value as T;
    }

    public getAttributes(includeUndefined: boolean = false): Attributes {
        return includeUndefined
            ? objectDeepClone(this._attributes)
            : removeUndefinedAttributes(this._attributes, this.static('fields')) as Attributes;
    }

    public unsetAttribute(field: string): void {
        // TODO implement deep unsetter
        // TODO validate protected fields (e.g. id)
        if (objectHasOwnProperty(this._attributes, field)) {
            if (field in this.static('fields')) {
                this._attributes[field] = undefined;
            } else {
                delete this._attributes[field];
            }

            if (this._originalAttributes[field] !== undefined) {
                this._dirtyAttributes[field] = undefined;
            }

            if (this.hasAutomaticTimestamp(TimestampField.UpdatedAt)) {
                this.touch();
            }
        }
    }

    public isDirty(field?: string): boolean {
        return field
            ? field in this._dirtyAttributes
            : Object.values(this._dirtyAttributes).length > 0;
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

        const models = await this.getCascadeModels();

        await this.deleteModelsFromEngine(models);

        models.forEach(model => model.resetEngineData());

        return this;
    }

    public async save(): Promise<this> {
        validateRequiredAttributes(this._attributes, this.static('fields'));

        if (!this.isDirty()) {
            return this;
        }

        const existed = this._exists;
        const id = await this.syncDirty();

        this._wasRecentlyCreated = this._wasRecentlyCreated || !existed;
        this._attributes[this.static('primaryKey')] = this.parseKey(id);
        this.cleanDirty();

        return this;
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

    protected initialize(attributes: Attributes, exists: boolean): void {
        this._exists = exists;
        this._wasRecentlyCreated = false;

        this.initializeProxy();
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
                ) {
                    return Reflect.get(target, property, receiver);
                }

                const instance = target as unknown as Record<string, () => unknown>;
                const attributeGetter = stringToCamelCase(`get_${property}_attribute`);
                if (typeof instance[attributeGetter] === 'function') {
                    return instance[attributeGetter].call(target._proxy);
                }

                if (target.hasRelation(property)) {
                    return target.isRelationLoaded(property)
                        ? target.getRelationModels(property)
                        : undefined;
                }

                if (property.startsWith('related')) {
                    const relation = stringToCamelCase(property.substr(7));

                    if (target.hasRelation(relation)) {
                        return target._relations[relation];
                    }
                }

                return target.getAttribute(property);
            },
            set(target, property, value, receiver) {
                if (
                    typeof property !== 'string' ||
                    property in target ||
                    target.static('classFields').indexOf(property) !== -1
                ) {
                    return Reflect.set(target, property, value, receiver);
                }

                if (target.hasRelation(property)) {
                    target.setRelationModels(property, value);
                    return true;
                }

                target.setAttribute(property, value);
                return true;
            },
            deleteProperty(target, property) {
                if (typeof property !== 'string' || property in target) {
                    return Reflect.deleteProperty(target, property);
                }

                if (target.hasRelation(property)) {
                    target.unloadRelation(property);
                    return true;
                }

                if (
                    !(property in target._attributes) ||
                    target.static('classFields').indexOf(property) !== -1
                ) {
                    return Reflect.deleteProperty(target, property);
                }

                target.unsetAttribute(property);
                return true;
            },
        });
    }

    protected initializeAttributes(attributes: Attributes, exists: boolean): void {
        const fields = this.static('fields');

        this._attributes = objectDeepClone(attributes);
        this._originalAttributes = exists ? objectDeepClone(attributes) : {};
        this._dirtyAttributes = exists ? {} : objectDeepClone(attributes);

        if (!exists) {
            if (this.hasAutomaticTimestamp(TimestampField.CreatedAt) && !(TimestampField.CreatedAt in attributes)) {
                this._attributes.createdAt = new Date();
                this._dirtyAttributes.createdAt = this._attributes.createdAt;
            }

            if (this.hasAutomaticTimestamp(TimestampField.UpdatedAt) && !(TimestampField.UpdatedAt in attributes)) {
                this._attributes.updatedAt = new Date();
                this._dirtyAttributes.updatedAt = this._attributes.updatedAt;
            }
        }

        this._attributes = this.castAttributes(validateAttributes(this._attributes, fields), fields);
    }

    protected initializeRelations(): void {
        this._relations = this.static('relations').reduce((relations, name) => {
            const proxy = this._proxy as unknown as Record<string, () => Relation>;
            const relation = proxy[stringToCamelCase(name) + 'Relationship']();

            relation.name = name;
            relations[name] = relation;

            return relations;
        }, {} as Record<string, Relation>);
    }

    protected async createFromEngineDocument(id: Key, document: EngineDocument): Promise<this> {
        const attributes = await this.parseEngineDocumentAttributes(id, document);

        attributes[this.static('primaryKey')] = id;

        return this.newInstance(attributes, true);
    }

    protected async createManyFromEngineDocuments(documents: Record<string, EngineDocument>): Promise<this[]> {
        return Promise.all(
            Object
                .entries(documents)
                .map(([id, document]) => this.createFromEngineDocument(this.parseKey(id), document)),
        );
    }

    protected async syncDirty(): Promise<string> {
        const engine = requireEngine();

        if (!this._exists) {
            return engine.create(
                this.static('collection'),
                this.toEngineDocument(),
                this.getSerializedPrimaryKey() || undefined,
            );
        }

        const updates = this.getDirtyEngineDocumentUpdates();
        const id = this.getSerializedPrimaryKey() as string;

        await engine.update(this.static('collection'), id, updates);

        return id;
    }

    protected cleanDirty(): void {
        this._originalAttributes = objectDeepClone(this._attributes);
        this._dirtyAttributes = {};
        this._exists = true;
    }

    protected async getCascadeModels(): Promise<Model[]> {
        const relationPromises = this.static('relations')
            .map(relation => this._relations[relation])
            .filter(relation => relation.deleteStrategy === 'cascade')
            .map(async relation => {
                const relationModels = await relation.getModels();

                return relationModels.map(model => model.getCascadeModels());
            });
        const modelPromises = await Promise.all(relationPromises);
        const models = await Promise.all(modelPromises.flat());

        return [...models.flat(), this].filter(model => model.exists());
    }

    protected async deleteModelsFromEngine(models: Model[]): Promise<void> {
        const engine = requireEngine();

        // TODO cluster by collection and implement deleteMany
        const modelsData = models.map(
            model => [model.static('collection'), model.getSerializedPrimaryKey() as string],
        );

        await Promise.all(modelsData.map(([collection, id]) => engine.delete(collection, id)));
    }

    protected resetEngineData(): void {
        delete this._attributes[this.static('primaryKey')];
        this._exists = false;
        this._dirtyAttributes = objectDeepClone(this._attributes);
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
    ): SingleModelRelation {
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
    ): SingleModelRelation {
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
    ): MultiModelRelation {
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
    ): MultiModelRelation {
        return new BelongsToManyRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    protected castAttributes(attributes: Attributes, definitions: BootedFieldsDefinition): Attributes {
        const castedAttributes = {} as Record<string, unknown>;

        for (const field in attributes) {
            castedAttributes[field] = this.castAttribute(
                attributes[field],
                definitions[field],
            );
        }

        return castedAttributes;
    }

    protected castAttribute(value: unknown, definition?: BootedFieldDefinition): unknown {
        if (isNullable(value))
            return value;

        if (typeof definition === 'undefined') {
            switch (typeof value) {
                case 'object':
                    return (value as Record<string, unknown>).toString();
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
                if (!['string', 'number'].includes(typeof value) && !(value instanceof Date))
                    throw new SoukaiError(`Invalid Date value: ${value}`);

                return new Date(value as string | number | Date);
            case FieldType.Object:
                if (!isObject(value))
                    throw new SoukaiError(`Invalid Object value: ${value}`);

                return this.castAttributes(value, definition.fields as Record<string, BootedFieldDefinition>);
            case FieldType.Array:
                if (!Array.isArray(value))
                    throw new SoukaiError(`Invalid Array value: ${value}`);

                return value.map(attribute => this.castAttribute(
                    attribute,
                    definition.items as BootedFieldDefinition,
                ));
            case FieldType.Boolean:
                return !!value;
            case FieldType.Number: {
                const number = parseFloat(value as string);

                if (isNaN(number))
                    throw new SoukaiError(`Invalid Number value: ${value}`);

                return number;
            }
            case FieldType.String: {
                const toString = (value as { toString?(): string })['toString'] ?? null;

                if (!toString)
                    throw new SoukaiError(`Invalid String value: ${value}`);

                return toString.call(value);
            }
            default:
                return value;
        }
    }

    protected hasAutomaticTimestamp(timestamp: TimestampFieldValue): boolean {
        return (this.static('timestamps')).indexOf(timestamp) !== -1;
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

    protected requireRelation(relation: string): Relation {
        if (!(relation in this._relations)) {
            throw new SoukaiError(`Attempting to use undefined ${relation} relation.`);
        }

        return this._relations[relation];
    }

}

export interface Model extends ModelInterface<typeof Model> {}

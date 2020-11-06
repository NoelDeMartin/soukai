import Soukai from '@/Soukai';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import SoukaiError from '@/errors/SoukaiError';

import { deepClone } from '@/internal/utils/Obj';

import Arr from '@/internal/utils/Arr';
import Obj from '@/internal/utils/Obj';
import { camelCase, studlyCase } from '@/internal/utils/Str';

import { EngineDocument, EngineFilters, EngineUpdates } from '@/engines/Engine';

import BelongsToManyRelation from './relations/BelongsToManyRelation';
import BelongsToOneRelation from './relations/BelongsToOneRelation';
import HasManyRelation from './relations/HasManyRelation';
import HasOneRelation from './relations/HasOneRelation';
import MultiModelRelation from './relations/MultiModelRelation';
import Relation from './relations/Relation';
import SingleModelRelation from './relations/SingleModelRelation';

export interface Attributes {
    [field: string]: any;
}

export enum FieldType {
    Number = 'number',
    String = 'string',
    Boolean = 'boolean',
    Array = 'array',
    Object = 'object',
    Date = 'date',
    Key = 'key',
}

export interface FieldsDefinition {
    [field: string]: FieldDefinition;
}

export interface FieldDefinition {

    type: FieldType;
    required: boolean;

    // Only with type FieldType.Array
    items?: FieldDefinition;

    // Only with type FieldType.Object
    fields?: FieldsDefinition;

}

const TYPE_VALUES = Object.values(FieldType);

const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt'];

/**
 * Active record model definition.
 */
export default abstract class Model<Key = any> {

    public static collection: string;

    public static primaryKey: string = 'id';

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static modelName: string;

    public static classFields: string[] = [];

    public static relations: string[] = [];

    public static get instance(): Model {
        return new (this as any)();
    }

    protected static get pureInstance(): Model {
        return new (this as any)({ __pureInstance: true });
    }

    public static boot(name: string): void {
        const modelClass = this;
        const fieldDefinitions: FieldsDefinition = {};

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
                if (TIMESTAMP_FIELDS.indexOf(field) === -1) {
                    throw new InvalidModelDefinition(name, `Invalid timestamp field defined (${field})`);
                }

                fieldDefinitions[field] = { type: FieldType.Date, required: false };
            }
        } else {
            throw new InvalidModelDefinition(name, 'Invalid timestamps definition');
        }

        // Validate fields
        if (typeof modelClass.fields !== 'undefined') {
            for (const field in modelClass.fields) {
                if (modelClass.fields.hasOwnProperty(field)) {
                    fieldDefinitions[field] = validateFieldDefinition(name, field, modelClass.fields[field]);

                    if (
                        modelClass.timestamps.indexOf(field) !== -1 && (
                            fieldDefinitions[field].type !== FieldType.Date ||
                            fieldDefinitions[field].required
                        )
                    ) {
                        throw new InvalidModelDefinition(
                            name,
                            `Field ${field} definition must be type date and not required ` +
                            `because it is used an automatic timestamp. ` +
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
        const classFields: string[] = Object.getOwnPropertyNames(modelClass.pureInstance);
        const relations: string[] = [];

        let prototype = Object.getPrototypeOf(modelClass.pureInstance);
        while (prototype !== Model.prototype) {
            classFields.push(...prototype.constructor.classFields);

            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (property.endsWith('Relationship') && typeof modelClass.pureInstance[property] === 'function') {
                    relations.push(property.substring(0, property.length - 12));
                }
            }

            prototype = Object.getPrototypeOf(prototype);
        }

        modelClass.classFields = Arr.unique(classFields);
        modelClass.relations = Arr.unique(relations);
        modelClass.fields = fieldDefinitions;
        modelClass.modelName = name;
    }

    public static create<T extends Model>(attributes: Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static createFromEngineDocument<T extends Model, Key = any>(id: Key, document: EngineDocument): Promise<T> {
        return this.instance.createFromEngineDocument(id, document);
    }

    public static createManyFromEngineDocuments<T extends Model>(documents: MapObject<EngineDocument>): Promise<T[]> {
        return this.instance.createManyFromEngineDocuments(documents);
    }

    public static find<T extends Model, Key = any>(id: Key): Promise<T | null> {
        this.ensureBooted();

        return Soukai
            .requireEngine()
            .readOne(this.collection, this.instance.serializeKey(id))
            .then(document => this.createFromEngineDocument<T, Key>(id, document))
            .catch(() => null);
    }

    /**
     * Get all models matching the given filters.
     *
     * @param filters
     */
    public static async all<T extends Model>(filters?: EngineFilters): Promise<T[]> {
        this.ensureBooted();

        const engine = Soukai.requireEngine();
        const documents = await engine.readMany(this.collection, filters);
        const models = await this.createManyFromEngineDocuments(documents);

        return models as any as T[];
    }

    public static async first<T extends Model>(filters?: EngineFilters): Promise<T|null> {
        // TODO implement limit 1
        const [model] = await this.all<T>(filters);

        return model || null;
    }

    private static ensureBooted(): void {
        const modelClass = (<any> this);

        if (typeof modelClass.modelName === 'undefined') {
            throw new SoukaiError(
                'Model has not been booted (did you forget to call Soukai.loadModel?) ' +
                'Learn more at https://soukai.js.org/guide/defining-models.html',
            );
        }
    }

    protected _exists: boolean;
    protected _wasRecentlyCreated: boolean;
    protected _proxy: Model;
    protected _attributes: Attributes;
    protected _originalAttributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _relations: { [relation: string]: Relation };

    [field: string]: any;

    constructor(attributes: Attributes = {}, exists: boolean = false) {
        // We need to do this in order to get a pure instance during boot,
        // that is an instance that is not being proxied. This is necessary
        // to obtain information about the class definition, for example class fields.
        if ('__pureInstance' in attributes) {
            return;
        }

        this.modelClass.ensureBooted();
        this.initialize(attributes, exists);

        return this._proxy;
    }

    public get modelClass(): typeof Model {
        return (this.constructor as any);
    }

    public update<T extends Model>(attributes: Attributes = {}): Promise<T> {
        // TODO validate protected fields (e.g. id)

        attributes = this.castAttributes(attributes, this.modelClass.fields);

        for (const field in attributes) {
            this.setAttribute(field, attributes[field]);
        }

        if (this.hasAutomaticTimestamp('updatedAt')) {
            this.touch();
        }

        return this.save();
    }

    public hasRelation(relation: string): boolean {
        return this.modelClass.relations.indexOf(relation) !== -1;
    }

    public getRelation(relation: string): Relation | null {
        return this._relations[relation] || null;
    }

    public loadRelation(relation: string): Promise<null | Model | Model[]> {
        return this.requireRelation(relation).resolve();
    }

    public async loadRelationIfUnloaded(relation: string): Promise<null | Model | Model[]> {
        return this.isRelationLoaded(relation)
            ? this.getRelationModels(relation)
            : this.loadRelation(relation);
    }

    public unloadRelation(relation: string): void {
        this.requireRelation(relation).unload();
    }

    public getRelationModels(relation: string): null | Model[] | Model {
        return this.requireRelation(relation).related;
    }

    public setRelationModels(relation: string, models: null | Model | Model[]): void {
        this.requireRelation(relation).related = models;
    }

    public isRelationLoaded(relation: string): boolean {
        return this.requireRelation(relation).loaded;
    }

    public hasAttribute(field: string): boolean {
        const fields = field.split('.');
        let value = <Attributes> cleanUndefinedAttributes(this._attributes, this.modelClass.fields);

        while (fields.length > 0) {
            value = value[<string> fields.shift()];

            if (typeof value === 'undefined') {
                return false;
            }
        }

        return true;
    }

    public setAttribute(field: string, value: any): void {
        // TODO implement deep setter

        value = this.castAttribute(value, this.modelClass.fields[field]);

        this._attributes[field] = value;

        delete this._dirtyAttributes[field];

        if (!Obj.deepEquals(this._originalAttributes[field], value)) {
            this._dirtyAttributes[field] = value;
        }

        if (this.hasAutomaticTimestamp('updatedAt') && field !== 'updatedAt') {
            this.touch();
        }
    }

    public setAttributes(attributes: Attributes): void {
        for (const [field, value] of Object.entries(attributes)) {
            this.setAttribute(field, value);
        }
    }

    public getAttribute(field: string, includeUndefined: boolean = false): any {
        const fields = field.split('.');
        let value = this.getAttributes(includeUndefined);

        while (fields.length > 0) {
            value = value[fields.shift() as string];

            if (typeof value === 'undefined') {
                return value;
            }
        }

        return value;
    }

    public getAttributes(includeUndefined: boolean = false): Attributes {
        return includeUndefined
            ? deepClone(this._attributes)
            : <Attributes> cleanUndefinedAttributes(this._attributes, this.modelClass.fields);
    }

    public unsetAttribute(field: string): void {
        // TODO implement deep unsetter
        // TODO validate protected fields (e.g. id)
        if (this._attributes.hasOwnProperty(field)) {
            if (field in this.modelClass.fields) {
                this._attributes[field] = undefined;
            } else {
                delete this._attributes[field];
            }

            if (this._originalAttributes[field] !== undefined) {
                this._dirtyAttributes[field] = undefined;
            }

            if (this.hasAutomaticTimestamp('updatedAt')) {
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
        return this._attributes[this.modelClass.primaryKey];
    }

    public getSerializedPrimaryKey(): string | null {
        const primaryKey = this.getPrimaryKey();

        return primaryKey ? this.serializeKey(primaryKey) : null;
    }

    public async delete<T extends Model>(): Promise<T> {
        if (!this._exists) {
            return this as any;
        }

        const models = await this.getCascadeModels();

        await this.deleteModelsFromEngine(models);

        models.forEach(model => model.resetEngineData());

        return this as any;
    }

    public async save<T extends Model>(): Promise<T> {
        ensureRequiredAttributes(this._attributes, this.modelClass.fields);

        if (!this.isDirty()) {
            return this as any;
        }

        const existed = this._exists;
        const id = await this.syncDirty();

        this._wasRecentlyCreated = this._wasRecentlyCreated || !existed;
        this._attributes[this.modelClass.primaryKey] = this.parseKey(id);
        this.cleanDirty();

        return this as any;
    }

    /**
     * Set the `updatedAt` attribute to the current time.
     */
    public touch(): void {
        this.setAttribute('updatedAt', new Date());
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
                    target.modelClass.classFields.indexOf(property) !== -1
                ) {
                    return Reflect.get(target, property, receiver);
                }

                const attributeAccessor = 'get' + studlyCase(property) + 'Attribute';
                if (typeof target[attributeAccessor] === 'function') {
                    return target[attributeAccessor]();
                }

                if (target.hasRelation(property)) {
                    return target.isRelationLoaded(property)
                        ? target.getRelationModels(property)
                        : undefined;
                }

                if (property.startsWith('related')) {
                    const relation = camelCase(property.substr(7));

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
                    target.modelClass.classFields.indexOf(property) !== -1
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
                    target.modelClass.classFields.indexOf(property) !== -1
                ) {
                    return Reflect.deleteProperty(target, property);
                }

                target.unsetAttribute(property);
                return true;
            },
        });
    }

    protected initializeAttributes(attributes: Attributes, exists: boolean): void {
        this._attributes = Obj.deepClone(attributes);
        this._originalAttributes = exists ? Obj.deepClone(attributes) : {};
        this._dirtyAttributes = exists ? {} : Obj.deepClone(attributes);

        if (!exists) {
            if (this.hasAutomaticTimestamp('createdAt') && !('createdAt' in attributes)) {
                this._attributes.createdAt = new Date();
                this._dirtyAttributes.createdAt = this._attributes.createdAt;
            }

            if (this.hasAutomaticTimestamp('updatedAt') && !('updatedAt' in attributes)) {
                this._attributes.updatedAt = new Date();
                this._dirtyAttributes.updatedAt = this._attributes.updatedAt;
            }
        }

        this._attributes = this.castAttributes(
            ensureAttributesExistance(
                this._attributes,
                this.modelClass.fields,
            ),
            this.modelClass.fields,
        );
    }

    protected initializeRelations(): void {
        this._relations = this.modelClass.relations.reduce((relations, name) => {
            const relation = this._proxy[camelCase(name) + 'Relationship']();

            relation.name = name;
            relations[name] = relation;

            return relations;
        }, {});
    }

    protected async createFromEngineDocument<T extends Model>(id: Key, document: EngineDocument): Promise<T> {
        const attributes = await this.parseEngineDocumentAttributes(id, document);

        attributes[this.modelClass.primaryKey] = id;

        return new (this.modelClass as any)(attributes, true);
    }

    protected async createManyFromEngineDocuments<T extends Model>(documents: MapObject<EngineDocument>): Promise<T[]> {
        return Promise.all(
            Object
                .entries(documents)
                .map(([id, document]) => this.createFromEngineDocument<T>(this.parseKey(id), document)),
        );
    }

    protected async syncDirty(): Promise<string> {
        const engine = Soukai.requireEngine();

        if (!this._exists) {
            return engine.create(
                this.modelClass.collection,
                this.toEngineDocument(),
                this.getSerializedPrimaryKey() || undefined,
            );
        }

        const updates = this.getDirtyEngineDocumentUpdates();
        const id = this.getSerializedPrimaryKey()!;

        await engine.update(this.modelClass.collection, id, updates);

        return id;
    }

    protected cleanDirty(): void {
        this._originalAttributes = Obj.deepClone(this._attributes);
        this._dirtyAttributes = {};
        this._exists = true;
    }

    protected async getCascadeModels(): Promise<Model[]> {
        const relationPromises = this.modelClass.relations
            .map(relation => this._relations[relation])
            .filter(relation => relation.deleteMode === 'cascade')
            .map(async relation => {
                const relationModels = await relation.getModels();

                return relationModels.map(model => model.getCascadeModels());
            });
        const modelPromises = await Promise.all(relationPromises);
        const models = await Promise.all(Arr.flatten(modelPromises));

        return [...Arr.flatten(models), this].filter(model => model.exists());
    }

    protected async deleteModelsFromEngine(models: Model[]): Promise<void> {
        const engine = Soukai.requireEngine();

        // TODO cluster by collection and implement deleteMany
        const modelsData = models.map(model => [model.modelClass.collection, model.getSerializedPrimaryKey()!]);

        await Promise.all(modelsData.map(([collection, id]) => engine.delete(collection, id)));
    }

    protected resetEngineData(): void {
        delete this._attributes[this.modelClass.primaryKey];
        this._exists = false;
        this._dirtyAttributes = Obj.deepClone(this._attributes);
    }

    /**
     * Creates a relation when this model is referenced by one instance of another model.
     *
     * @param relatedClass Related model class.
     * @param foreignKeyField Name of the foreign key field in the related model.
     * @param localKeyField Name of the local key field in the local model. Defaults to
     * the primary key name defined in the local model class.
     */
    protected hasOne(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation {
        return new HasOneRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model references one instance of another model.
     *
     * @param relatedClass Related model class.
     * @param foreignKeyField Name of the foreign key field in the local model.
     * @param localKeyField Name of the local key field in the related model. Defaults to
     * the primary key name defined in the related model class.
     */
    protected belongsToOne(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation {
        return new BelongsToOneRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * @deprecated use belongsToOne instead.
     */
    protected belongsTo(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation {
        return this.belongsToOne(relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model is referenced by multiple instances of another model.
     *
     * @param relatedClass Related model class.
     * @param foreignKeyField Name of the foreign key field in the related model.
     * @param localKeyField Name of the local key field in the local model. Defaults to
     * the primary key name defined in the local model class.
     */
    protected hasMany(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation {
        return new HasManyRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    /**
     * Creates a relation when this model references multiple instances of another model.
     *
     * @param relatedClass Related model class.
     * @param foreignKeyField Name of the foreign key field in the local model.
     * @param localKeyField Name of the local key field in the related model. Defaults to
     * the primary key name defined in the related model class.
     */
    protected belongsToMany(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): MultiModelRelation {
        return new BelongsToManyRelation(this, relatedClass, foreignKeyField, localKeyField);
    }

    protected castAttributes(attributes: Attributes, definitions: FieldsDefinition): Attributes {
        const castedAttributes = {};

        for (const field in attributes) {
            castedAttributes[field] = this.castAttribute(
                attributes[field],
                definitions[field],
            );
        }

        return castedAttributes;
    }

    protected castAttribute(value: any, definition?: FieldDefinition): any {
        if (isEmpty(value)) {
            return value;
        }

        if (typeof definition === 'undefined') {
            switch (typeof value) {
                case 'object':
                    return value.toString();
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
                return new Date(value);
            case FieldType.Object:
                return this.castAttributes(value, definition.fields as FieldsDefinition);
            case FieldType.Array:
                return value.map(attribute => this.castAttribute(
                    attribute,
                    definition.items as FieldDefinition,
                ));
            case FieldType.Boolean:
                return !!value;
            case FieldType.Number:
                return parseFloat(value);
            case FieldType.String:
                return value.toString();
            default:
                return value;
        }
    }

    protected hasAutomaticTimestamp(timestamp: string): boolean {
        return (this.modelClass.timestamps as string[]).indexOf(timestamp) !== -1;
    }

    protected toEngineDocument(): EngineDocument {
        return cleanUndefinedAttributes(
            this._attributes,
            this.modelClass.fields,
        ) as Attributes;
    }

    protected getDirtyEngineDocumentUpdates(): EngineUpdates {
        const updates = Obj.deepClone(this._dirtyAttributes);

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
        return (key as any).toString();
    }

    protected parseKey(key: string): Key {
        return key as any as Key;
    }

    protected requireRelation(relation: string): Relation {
        if (!(relation in this._relations)) {
            throw new SoukaiError(`Attempting to use undefined ${relation} relation.`);
        }

        return this._relations[relation];
    }

}

function validateFieldDefinition(
    model: string,
    field: string,
    definition: any,
    hasRequired: boolean = true,
): FieldDefinition {
    let fieldDefinition: FieldDefinition = <any> {};

    if (TYPE_VALUES.indexOf(definition) !== -1) {
        fieldDefinition.type = definition;
    } else if (typeof definition === 'object') {
        fieldDefinition = definition;
    } else {
        throw new InvalidModelDefinition(model, `Invalid field definition ${field}`);
    }

    if (typeof fieldDefinition.type === 'undefined') {
        fieldDefinition = <any> {
            fields: fieldDefinition,
            type: FieldType.Object,
        };
    } else if (TYPE_VALUES.indexOf(fieldDefinition.type) === -1) {
        throw new InvalidModelDefinition(model, `Invalid field definition ${field}`);
    }

    if (hasRequired) {
        fieldDefinition.required = !!fieldDefinition.required;
    }

    switch (fieldDefinition.type) {
        case FieldType.Object:
            if (typeof fieldDefinition.fields !== 'undefined') {
                for (const f in fieldDefinition.fields) {
                    if (fieldDefinition.fields.hasOwnProperty(f)) {
                        fieldDefinition.fields[f] = validateFieldDefinition(model, f, fieldDefinition.fields[f]);
                    }
                }
            } else {
                throw new InvalidModelDefinition(
                    model,
                    `Field definition of type object requires fields attribute ${field}`,
                );
            }
            break;
        case FieldType.Array:
            if (typeof fieldDefinition.items !== 'undefined') {
                fieldDefinition.items = validateFieldDefinition(model, 'items', fieldDefinition.items, false);
            } else {
                throw new InvalidModelDefinition(
                    model,
                    `Field definition of type array requires items attribute. Field: '${field}'`,
                );
            }
            break;
    }

    return fieldDefinition;
}

function ensureAttributesExistance(attributes: Attributes, fields: FieldsDefinition): Attributes {
    for (const field in fields) {
        const definition = fields[field];

        if (!(field in attributes)) {
            switch (definition.type) {
                case FieldType.Object:
                    attributes[field] = {};
                    break;
                case FieldType.Array:
                    attributes[field] = [];
                    break;
                default:
                    attributes[field] = undefined;
                    break;
            }
        }

        if (definition.type === FieldType.Object) {
            attributes[field] = ensureAttributesExistance(attributes[field], <FieldsDefinition> definition.fields);
        }
    }

    return attributes;
}

function ensureRequiredAttributes(attributes: Attributes, fields: FieldsDefinition): void {
    for (const field in fields) {
        const definition = fields[field];

        if (definition.required && (!(field in attributes) || isEmpty(attributes[field]))) {
            throw new SoukaiError(`The ${field} attribute is required.`);
        }

        if ((field in attributes) && !isEmpty(attributes[field]) && definition.type === FieldType.Object) {
            ensureRequiredAttributes(attributes[field], <FieldsDefinition> definition.fields);
        }
    }
}

function isEmpty(value: any): boolean {
    return typeof value === 'undefined' || value === null;
}

function cleanUndefinedAttributes(
    attributes: Attributes,
    fields: FieldsDefinition,
    returnUndefined: boolean = false,
): Attributes | undefined {
    attributes = deepClone(attributes);

    for (const field in attributes) {
        if (typeof attributes[field] === 'undefined') {
            delete attributes[field];
        } else if (field in fields && fields[field].type === FieldType.Object) {
            const value = cleanUndefinedAttributes(attributes[field], <FieldsDefinition> fields[field].fields, true);

            if (typeof value === 'undefined') {
                delete attributes[field];
            } else {
                attributes[field] = value;
            }
        }
    }

    return returnUndefined && Object.keys(attributes).length === 0 ? undefined : attributes;
}

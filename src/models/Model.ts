import Soukai from '@/Soukai';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import SoukaiError from '@/errors/SoukaiError';

import { deepClone } from '@/internal/utils/Obj';

import Arr from '@/internal/utils/Arr';
import Obj from '@/internal/utils/Obj';
import { camelCase, studlyCase } from '@/internal/utils/Str';

import { EngineDocument, EngineFilters } from '@/engines/Engine';

import BelongsToManyRelation from './relations/BelongsToManyRelation';
import BelongsToRelation from './relations/BelongsToRelation';
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
        const classDef = this;
        const fieldDefinitions: FieldsDefinition = {};

        // Validate collection
        if (typeof classDef.collection === 'undefined') {
            classDef.collection = name.toLowerCase() + 's';
        } else if (typeof classDef.collection !== 'string') {
            throw new InvalidModelDefinition(name, 'Collection name not defined or invalid format');
        }

        // Validate timestamps
        if (typeof classDef.timestamps === 'boolean' || typeof classDef.timestamps === 'undefined') {
            if (typeof classDef.timestamps === 'undefined' || classDef.timestamps) {
                for (const field of TIMESTAMP_FIELDS) {
                    fieldDefinitions[field] = { type: FieldType.Date, required: false };
                }
                classDef.timestamps = TIMESTAMP_FIELDS;
            } else {
                classDef.timestamps = [];
            }
        } else if (Array.isArray(classDef.timestamps)) {
            for (const field of classDef.timestamps) {
                if (TIMESTAMP_FIELDS.indexOf(field) === -1) {
                    throw new InvalidModelDefinition(name, `Invalid timestamp field defined (${field})`);
                }

                fieldDefinitions[field] = { type: FieldType.Date, required: false };
            }
        } else {
            throw new InvalidModelDefinition(name, 'Invalid timestamps definition');
        }

        // Validate fields
        if (typeof classDef.fields !== 'undefined') {
            for (const field in classDef.fields) {
                if (classDef.fields.hasOwnProperty(field)) {
                    fieldDefinitions[field] = validateFieldDefinition(name, field, classDef.fields[field]);

                    if (
                        classDef.timestamps.indexOf(field) !== -1 && (
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
        if (!(classDef.primaryKey in fieldDefinitions)) {
            fieldDefinitions[classDef.primaryKey] = {
                type: FieldType.Key,
                required: false,
            };
        }

        // Obtain class definition information
        const classFields: string[] = Object.getOwnPropertyNames(classDef.pureInstance);
        const relations: string[] = [];

        let prototype = Object.getPrototypeOf(classDef.pureInstance);
        while (prototype !== Model.prototype) {
            classFields.push(...prototype.constructor.classFields);

            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (property.endsWith('Relationship') && typeof classDef.pureInstance[property] === 'function') {
                    relations.push(property.substring(0, property.length - 12));
                }
            }

            prototype = Object.getPrototypeOf(prototype);
        }

        classDef.classFields = Arr.unique(classFields);
        classDef.relations = Arr.unique(relations);
        classDef.fields = fieldDefinitions;
        classDef.modelName = name;
    }

    public static create<T extends Model>(attributes: Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static createFromEngineDocument<T extends Model, Key = any>(id: Key, document: EngineDocument): Promise<T> {
        return this.instance.createFromEngineDocument(id, document);
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

        return Promise.all(
            Object
                .entries(documents)
                .map(
                    ([id, document]) =>
                        this.createFromEngineDocument<T>(this.instance.parseKey(id), document),
                ),
        );
    }

    public static async first<T extends Model>(filters?: EngineFilters): Promise<T|null> {
        // TODO implement limit 1
        const [model] = await this.all<T>(filters);

        return model || null;
    }

    private static ensureBooted(): void {
        const classDef = (<any> this);

        if (typeof classDef.modelName === 'undefined') {
            throw new SoukaiError(
                'Model has not been booted (did you forget to call Soukai.loadModel?) ' +
                'Learn more at https://soukai.js.org/guide/defining-models.html',
            );
        }
    }

    protected _exists: boolean;
    protected _proxy: Model;
    protected _attributes: Attributes;
    protected _originalAttributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _relations: { [relation: string]: Relation };

    protected get classDef(): typeof Model {
        return (this.constructor as any);
    }

    [field: string]: any;

    constructor(attributes: Attributes = {}, exists: boolean = false) {
        // We need to do this in order to get a pure instance during boot,
        // that is an instance that is not being proxied. This is necessary
        // to obtain information about the class definition, for example class fields.
        if ('__pureInstance' in attributes) {
            return;
        }

        this.classDef.ensureBooted();
        this.initialize(attributes, exists);

        return this._proxy;
    }

    public update<T extends Model>(attributes: Attributes = {}): Promise<T> {
        // TODO validate protected fields (e.g. id)

        attributes = this.castAttributes(attributes, this.classDef.fields);

        for (const field in attributes) {
            this.setAttribute(field, attributes[field]);
        }

        if (this.hasAutomaticTimestamp('updatedAt')) {
            this.touch();
        }

        return this.save();
    }

    public hasRelation(relation: string): boolean {
        return this.classDef.relations.indexOf(relation) !== -1;
    }

    public getRelation(relation: string): Relation | null {
        return this._relations[relation] || null;
    }

    public loadRelation(relation: string): Promise<null | Model | Model[]> {
        const relationInstance = this[camelCase(relation) + 'Relationship']() as Relation;
        const promise = relationInstance.resolve();

        promise.then(models => this.setRelationModels(relation, models));

        return promise;
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
        let value = <Attributes> cleanUndefinedAttributes(this._attributes, this.classDef.fields);

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

        value = this.castAttribute(value, this.classDef.fields[field]);

        this._attributes[field] = value;

        delete this._dirtyAttributes[field];

        if (!Obj.deepEquals(this._originalAttributes[field], value)) {
            this._dirtyAttributes[field] = value;
        }

        if (this.hasAutomaticTimestamp('updatedAt') && field !== 'updatedAt') {
            this.touch();
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
            : <Attributes> cleanUndefinedAttributes(this._attributes, this.classDef.fields);
    }

    public unsetAttribute(field: string): void {
        // TODO implement deep unsetter
        // TODO validate protected fields (e.g. id)
        if (this._attributes.hasOwnProperty(field)) {
            if (field in this.classDef.fields) {
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

    public isDirty(name: string): boolean {
        return name in this._dirtyAttributes;
    }

    public getPrimaryKey(): Key | null {
        return this._attributes[this.classDef.primaryKey];
    }

    public getSerializedPrimaryKey(): string | null {
        const primaryKey = this.getPrimaryKey();

        return primaryKey ? this.serializeKey(primaryKey) : null;
    }

    public delete<T extends Model>(): Promise<T> {
        if (!this._exists) {
            return this as any;
        }

        return Soukai
            .requireEngine()
            .delete(
                this.classDef.collection,
                this.getSerializedPrimaryKey()!,
            )
            .then(() => {
                delete this._attributes[this.classDef.primaryKey];
                this._exists = false;

                return this as any;
            });
    }

    public async save<T extends Model>(): Promise<T> {
        ensureRequiredAttributes(this._attributes, this.classDef.fields);

        const id = await this.syncDirty();

        this._attributes[this.classDef.primaryKey] = this.parseKey(id);
        this.cleanDirty();

        return <any> this;
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

    protected initialize(attributes: Attributes, exists: boolean): void {
        this._exists = exists;
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
                    target.classDef.classFields.indexOf(property) !== -1
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
                    target.classDef.classFields.indexOf(property) !== -1
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
                    target.classDef.classFields.indexOf(property) !== -1
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
                this.classDef.fields,
            ),
            this.classDef.fields,
        );
    }

    protected initializeRelations(): void {
        this._relations = this.classDef.relations.reduce((relations, name) => ({
            ...relations,
            [name]: this._proxy[camelCase(name) + 'Relationship'](),
        }), {});
    }

    protected async createFromEngineDocument<T extends Model>(id: Key, document: EngineDocument): Promise<T> {
        const attributes = await this.parseEngineDocumentAttributes(id, document);

        attributes[this.classDef.primaryKey] = id;

        return new (this.classDef as any)(attributes, true);
    }

    protected async syncDirty(): Promise<string> {
        const engine = Soukai.requireEngine();

        if (!this._exists) {
            return engine.create(
                this.classDef.collection,
                this.toEngineDocument(),
                this.getSerializedPrimaryKey() || undefined,
            );
        }

        const [updatedAttributes, removedAttributes] = this.getDirtyEngineDocumentAttributes();
        const id = this.getSerializedPrimaryKey()!;

        await engine.update(this.classDef.collection, id, updatedAttributes, removedAttributes);

        return id;
    }

    protected cleanDirty(): void {
        this._originalAttributes = Obj.deepClone(this._attributes);
        this._dirtyAttributes = {};
        this._exists = true;
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
    protected belongsTo(
        relatedClass: typeof Model,
        foreignKeyField?: string,
        localKeyField?: string,
    ): SingleModelRelation {
        return new BelongsToRelation(this, relatedClass, foreignKeyField, localKeyField);
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
        return (this.classDef.timestamps as string[]).indexOf(timestamp) !== -1;
    }

    protected toEngineDocument(): EngineDocument {
        return cleanUndefinedAttributes(
            this._attributes,
            this.classDef.fields,
        ) as Attributes;
    }

    protected getDirtyEngineDocumentAttributes(): [EngineDocument, string[][]] {
        const updatedAttributes = Obj.deepClone(this._dirtyAttributes);
        const removedAttributes: string[][] = [];

        for (const field in updatedAttributes) {
            if (updatedAttributes[field] !== undefined) {
                continue;
            }

            removedAttributes.push([field]);
            delete updatedAttributes[field];
        }

        return [updatedAttributes as EngineDocument, removedAttributes];
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

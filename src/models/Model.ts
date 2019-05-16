import Soukai from '@/Soukai';

import InvalidModelDefinition from '@/errors/InvalidModelDefinition';
import SoukaiError from '@/errors/SoukaiError';

import { deepClone } from '@/internal/utils/Obj';
import Str from '@/internal/utils/Str';

import Engine, { EngineAttributes, Filters } from '@/engines/Engine';

import BelongsToOneRelation from '@/models/relations/BelongsToOneRelation';
import HasManyRelation from '@/models/relations/HasManyRelation';
import MultipleModelsRelation from '@/models/relations/MultipleModelsRelation';
import Relation from '@/models/relations/Relation';
import SingleModelRelation from '@/models/relations/SingleModelRelation';

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

interface RelationsMap {
    [relation: string]: undefined | null | Model | Model[];
}

const TYPE_VALUES = Object.values(FieldType);

const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt'];

export default abstract class Model<Key = any> {

    public static collection: string;

    public static primaryKey: string = 'id';

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static modelName: string;

    public static classFields: string[] = [];

    public static relations: string[] = [];

    protected static get instance(): Model {
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
                    if (classDef.timestamps.indexOf(field) !== -1) {
                        throw new InvalidModelDefinition(
                            name,
                            `Field ${field} cannot be defined because it's being used as an automatic timestamp`,
                        );
                    } else {
                        fieldDefinitions[field] = validateFieldDefinition(name, field, classDef.fields[field]);
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
        classDef.classFields.push(...Object.getOwnPropertyNames(classDef.pureInstance));

        let prototype = Object.getPrototypeOf(classDef.pureInstance);
        while (prototype !== Model.prototype) {
            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (property.endsWith('Relationship') && typeof classDef.pureInstance[property] === 'function') {
                    classDef.relations.push(property.substring(0, property.length - 12));
                }
            }

            prototype = Object.getPrototypeOf(prototype);
        }

        classDef.fields = fieldDefinitions;
        classDef.modelName = name;
    }

    public static create<T extends Model>(attributes: Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static find<T extends Model, Key = any>(id: Key): Promise<T | null> {
        this.ensureBooted();

        return Soukai.withEngine(engine =>
            engine
                .readOne(this.collection, this.instance.serializeKey(id))
                .then(result => {
                    const attributes = this.instance.parseEngineAttributes(engine, result);

                    return new (this as any)(attributes, true);
                })
                .catch(() => null),
        );
    }

    /**
     * Get all models matching the given filters.
     *
     * @param filters
     */
    public static all<T extends Model>(filters?: Filters): Promise<T[]> {
        this.ensureBooted();

        return Soukai.withEngine(engine =>
            engine
                .readMany(this.collection, filters)
                .then(documents => {
                    const results: T[] = [];

                    for (const id in documents) {
                        const attributes = this.instance.parseEngineAttributes(engine, documents[id]);

                        attributes[this.primaryKey] = id;

                        results.push(new (this as any)(attributes, true));
                    }

                    return results;
                }),
        );
    }

    private static ensureBooted(): void {
        const classDef = (<any> this);

        if (typeof classDef.modelName === 'undefined') {
            throw new SoukaiError(
                'Model has not been booted (did you forget to call Soukai.loadModel?) ' +
                'Learn more at https://soukai.js.org/guide.html#defining-models',
            );
        }
    }

    protected _exists: boolean;
    protected _attributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _removedAttributes: string[];
    protected _relations: RelationsMap;

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

        this._exists = exists;
        this.initAttributes(attributes, exists);
        this.initRelations();

        return new Proxy(this, {
            get(target, property, receiver) {
                if (
                    typeof property !== 'string' ||
                    property in target ||
                    target.classDef.classFields.indexOf(property) !== -1
                ) {
                    return Reflect.get(target, property, receiver);
                }

                const attributeAccessor = 'get' + Str.studlyCase(property) + 'Attribute';
                if (typeof target[attributeAccessor] === 'function') {
                    return target[attributeAccessor]();
                }

                if (target.hasRelation(property)) {
                    return target.isRelationLoaded(property)
                        ? target.getRelationModels(property)
                        : undefined;
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

    public update<T extends Model>(attributes: Attributes = {}): Promise<T> {
        // TODO validate protected fields (e.g. id)

        attributes = this.castAttributes(attributes, this.classDef.fields);

        this._attributes = { ...this._attributes, ...attributes };
        this._dirtyAttributes = { ...this._dirtyAttributes, ...attributes };
        this.touch();

        return this.save();
    }

    public hasRelation(relation: string): boolean {
        return this.classDef.relations.indexOf(relation) !== -1;
    }

    public loadRelation(relation: string): Promise<null | Model | Model[]> {
        const relationInstance = this[Str.camelCase(relation) + 'Relationship']() as Relation;
        const promise = relationInstance.resolve();

        promise.then(models => this.setRelationModels(relation, models));

        return promise;
    }

    public unloadRelation(relation: string): void {
        if (this.isRelationLoaded(relation)) {
            delete this._relations[relation];
        }
    }

    public getRelationModels(relation: string): null | Model[] | Model {
        return this._relations[relation] || null;
    }

    public setRelationModels(relation: string, models: null | Model | Model[]): void {
        this._relations[relation] = models;
    }

    public isRelationLoaded(relation: string): boolean {
        return typeof this._relations[relation] !== 'undefined';
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
        this._dirtyAttributes[field] = value;
        this.touch();
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
            this._removedAttributes.push(field);
            this.touch();
        }
    }

    public getPrimaryKey(): Key {
        return this._attributes[this.classDef.primaryKey];
    }

    public delete<T extends Model>(): Promise<T> {
        return Soukai.withEngine(engine =>
            engine
                .delete(
                    this.classDef.collection,
                    this._attributes[this.classDef.primaryKey],
                )
                .then(() => {
                    delete this._attributes[this.classDef.primaryKey];
                    this._exists = false;

                    return <any> this;
                }),
        );
    }

    public save<T extends Model>(): Promise<T> {
        if (this._exists) {
            ensureRequiredAttributes(this._attributes, this.classDef.fields);

            return Soukai.withEngine(engine =>
                engine
                    .update(
                        this.classDef.collection,
                        this._attributes[this.classDef.primaryKey],
                        this.prepareEngineAttributes(engine, this._dirtyAttributes),
                        [...this.prepareEngineAttributeNames(engine, this._removedAttributes)],
                    )
                    .then(() => {
                        this._dirtyAttributes = {};
                        this._removedAttributes = [];

                        return <any> this;
                    }),
            );
        } else {
            ensureRequiredAttributes(this._attributes, this.classDef.fields);

            return Soukai.withEngine(engine => {
                const attributes = cleanUndefinedAttributes(
                    this._attributes,
                    this.classDef.fields,
                ) as Attributes;

                const primaryKey = this.getPrimaryKey();

                return engine
                    .create(
                        this.classDef.collection,
                        this.prepareEngineAttributes(engine, attributes),
                        primaryKey ? this.serializeKey(primaryKey) : undefined,
                    )
                    .then(id => {
                        this._attributes[this.classDef.primaryKey] = this.parseKey(id);
                        this._dirtyAttributes = {};
                        this._removedAttributes = [];
                        this._exists = true;

                        return <any> this;
                    });
                },
            );
        }
    }

    public touch(): void {
        if (this.hasAutomaticTimestamp('updatedAt')) {
            this._attributes.updatedAt = new Date();
            this._dirtyAttributes.updatedAt = this._attributes.updatedAt;
        }
    }

    public setExists(exists: boolean): void {
        this._exists = exists;
    }

    public exists(): boolean {
        return this._exists;
    }

    protected initAttributes(attributes: Attributes, exists: boolean): void {
        this._attributes = { ...attributes };
        this._dirtyAttributes = exists ? {} : { ...attributes };
        this._removedAttributes = [];

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

    protected initRelations(): void {
        this._relations = {};

        for (const name of this.classDef.relations) {
            this._relations[name] = undefined;
        }
    }

    protected hasMany(model: typeof Model, relatedKeyField: string, parentKeyField?: string): MultipleModelsRelation {
        return new HasManyRelation(this, model, relatedKeyField, parentKeyField || this.classDef.primaryKey);
    }

    protected belongsToOne(
        model: typeof Model,
        parentKeyField: string,
        relatedKeyField?: string,
    ): SingleModelRelation {
        return new BelongsToOneRelation(
            this,
            model,
            parentKeyField,
            relatedKeyField || model.primaryKey,
        );
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

    protected prepareEngineAttributes(_: Engine, attributes: Attributes): EngineAttributes {
        return attributes;
    }

    protected prepareEngineAttributeNames(_: Engine, names: string[]): string[] {
        return names;
    }

    protected parseEngineAttributes(_: Engine, attributes: EngineAttributes): Attributes {
        return attributes;
    }

    protected serializeKey(key: Key): string {
        return key.toString();
    }

    protected parseKey(key: string): Key {
        return key as any as Key;
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
                    `Field definition of type array requires items attribute ${field}`,
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
            if (definition.type === FieldType.Object) {
                attributes[field] = {};
            } else {
                attributes[field] = undefined;
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

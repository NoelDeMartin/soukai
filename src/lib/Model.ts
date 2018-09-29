import * as Database from '@/lib/Database';
import Soukai from '@/lib/Soukai';

import InvalidModelDefinition from '@/lib/errors/InvalidModelDefinition';
import SoukaiError from '@/lib/errors/SoukaiError';

import { deepClone } from '@/utils/object';

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

const TIMESTAMP_FIELDS = ['created_at', 'updated_at'];

export default abstract class Model {

    public static collection: string;

    public static timestamps: string[] | boolean;

    public static fields: FieldsDefinition | any;

    public static readonly modelName: string;

    public static boot<T extends Model>(name: string): void {
        const classDef = (<any> this);

        if (typeof classDef.modelName !== 'undefined') {
            return;
        }

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

            // TODO validate protected fields (e.g. id)

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

        classDef.fields = fieldDefinitions;
        classDef.modelName = name;
    }

    public static create<T extends Model>(attributes: Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static find<T extends Model>(id: Database.Key): Promise<T | null> {
        this.ensureBooted();

        return Soukai.withEngine(engine =>
            engine
                .readOne(this, id)
                .then(document => new (<any> this)(convertFromDatabaseAttributes(document, this.fields), true))
                .catch(() => null),
        );
    }

    public static all<T extends Model>(): Promise<T[]> {
        this.ensureBooted();

        return Soukai.withEngine(engine =>
            engine
                .readMany(this)
                .then(documents =>
                        documents.map(document =>
                            new (<any> this)(convertFromDatabaseAttributes(document, this.fields), true),
                        ),
                ),
        );
    }

    private static ensureBooted(): void {
        const classDef = (<any> this);

        if (typeof classDef.modelName === 'undefined') {
            throw new SoukaiError('Model has not been booted (did you forget to call Soukai.loadModel?)');
        }
    }

    protected _exists: boolean;
    protected _attributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _removedAttributes: string[];

    [field: string]: any;

    constructor(attributes: Attributes = {}, exists: boolean = false) {
        // TODO validate protected fields (e.g. id)

        this.classDef.ensureBooted();

        this._exists = exists;
        this._attributes = {...attributes};
        this._dirtyAttributes = exists ? {} : {...attributes};
        this._removedAttributes = [];

        if (!exists && this.hasAutomaticTimestamp('created_at')) {
            this._attributes.created_at = new Date();
            this._dirtyAttributes.created_at = this._attributes.created_at;
        }

        if (!exists && this.hasAutomaticTimestamp('updated_at')) {
            this._attributes.updated_at = new Date();
            this._dirtyAttributes.updated_at = this._attributes.updated_at;
        }

        this._attributes = ensureAttributesExistance(this._attributes, this.classDef.fields);

        return new Proxy(this, {
            get(target, property, receiver) {
                if (typeof property !== 'string' || property in target || !(property in target._attributes)) {
                    return Reflect.get(target, property, receiver);
                } else {
                    return target.getAttribute(property);
                }
            },
            set(target, property, value, receiver) {
                if (property in target || typeof property !== 'string') {
                    return Reflect.set(target, property, value, receiver);
                } else {
                    target.setAttribute(property, value);
                    return true;
                }
            },
            deleteProperty(target, property) {
                if (typeof property !== 'string' || property in target || !(property in target._attributes)) {
                    return Reflect.deleteProperty(target, property);
                } else {
                    target.unsetAttribute(property);
                    return true;
                }
            },
        });
    }

    public update<T extends Model>(attributes: Attributes = {}): Promise<T> {
        // TODO validate protected fields (e.g. id)

        this._attributes = { ...this._attributes, ...attributes };
        this._dirtyAttributes = { ...this._dirtyAttributes, ...attributes };
        this.touch();

        return this.save();
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
        // TODO validate protected fields (e.g. id)
        this._attributes[field] = value;
        this._dirtyAttributes[field] = value;
        this.touch();
    }

    public getAttribute(field: string, includeUndefined: boolean = false): any {
        const fields = field.split('.');
        let value = this.getAttributes(includeUndefined);

        while (fields.length > 0) {
            value = value[<string> fields.shift()];

            if (typeof value === 'undefined') {
                break;
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

    public delete<T extends Model>(): Promise<T> {
        return Soukai.withEngine(engine =>
            engine
                .delete(
                    this.classDef,
                    this._attributes.id,
                )
                .then(() => {
                    delete this._attributes.id;
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
                        this.classDef,
                        this._attributes.id,
                        convertToDatabaseAttributes(this._dirtyAttributes, this.classDef.fields),
                        [...this._removedAttributes ],
                    )
                    .then(() => {
                        this._dirtyAttributes = {};
                        this._removedAttributes = [];

                        return <any> this;
                    }),
            );
        } else {
            ensureRequiredAttributes(this._attributes, this.classDef.fields);

            return Soukai.withEngine(engine =>
                engine
                    .create(
                        this.classDef,
                        convertToDatabaseAttributes(
                            <Attributes> cleanUndefinedAttributes(this._attributes, this.classDef.fields),
                            this.classDef.fields,
                        ),
                    )
                    .then(id => {
                        this._attributes.id = id;
                        this._dirtyAttributes = {};
                        this._removedAttributes = [];
                        this._exists = true;

                        return <any> this;
                    }),
            );
        }
    }

    public touch(): void {
        if (this.hasAutomaticTimestamp('updated_at')) {
            this._attributes.updated_at = new Date();
            this._dirtyAttributes.updated_at = this._attributes.updated_at;
        }
    }

    public existsInDatabase(): boolean {
        return this._exists;
    }

    private get classDef(): typeof Model {
        return (<any> this.constructor);
    }

    private hasAutomaticTimestamp(timestamp: string): boolean {
        return (<string[]> this.classDef.timestamps).indexOf(timestamp) !== -1;
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

function convertToDatabaseAttributes(attributes: Attributes, fields: FieldsDefinition): Database.Attributes {
    const databaseAttributes = {};

    for (const field in attributes) {
        const attribute = attributes[field];
        if (typeof attribute !== 'undefined') {
            if (fields.hasOwnProperty(field)) {
                databaseAttributes[field] = convertToDatabaseAttribute(attribute, fields[field]);
            } else {
                switch (typeof attribute) {
                    case 'object':
                        databaseAttributes[field] = attribute.toString();
                        break;
                    case 'undefined':
                    case 'symbol':
                    case 'function':
                        // Nothing to do here
                        break;
                    default:
                        databaseAttributes[field] = attribute;
                        break;
                }
            }
        }
    }

    return databaseAttributes;
}

function convertToDatabaseAttribute(
    attribute: Attributes,
    definition: FieldDefinition,
): Database.Value | Database.Value[] | Database.Attributes {
    switch (definition.type) {
        case FieldType.Date:
            return Math.round(attribute.getTime() / 1000);
        case FieldType.Object:
            return convertToDatabaseAttributes(attribute, <FieldsDefinition> definition.fields);
        case FieldType.Array:
            return attribute.map(attr => convertToDatabaseAttribute(attr, <FieldDefinition> definition.items));
        default:
            return attribute;
    }
}

function convertFromDatabaseAttributes(databaseAttributes: Database.Attributes, fields: FieldsDefinition): Attributes {
    const attributes = {};

    for (const field in databaseAttributes) {
        const attribute = databaseAttributes[field];
        if (fields.hasOwnProperty(field)) {
            attributes[field] = convertFromDatabaseAttribute(attribute, fields[field]);
        } else {
            attributes[field] = attribute;
        }
    }

    return attributes;
}

function convertFromDatabaseAttribute(
    attribute: Database.Value | Database.Value[] | Database.Attributes,
    definition: FieldDefinition,
): any {
    switch (definition.type) {
        case FieldType.Date:
            return new Date(<number> attribute * 1000);
        case FieldType.Object:
            return convertFromDatabaseAttributes(<Database.Attributes> attribute, <FieldsDefinition> definition.fields);
        case FieldType.Array:
            return (<Database.Value[]> attribute).map(attr =>
                convertFromDatabaseAttribute(<Database.Value> attr, <FieldDefinition> definition.items),
            );
        default:
            return attribute;
    }
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
        const isEmpty = !(field in attributes) ||
            typeof attributes[field] === 'undefined' ||
            attributes[field] === null;

        if (definition.required && isEmpty) {
            throw new SoukaiError(`The ${field} attribute is required`);
        }

        if (!isEmpty && definition.type === FieldType.Object) {
            ensureRequiredAttributes(attributes[field], <FieldsDefinition> definition.fields);
        }
    }
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

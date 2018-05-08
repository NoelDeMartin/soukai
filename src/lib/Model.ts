import Soukai from '@/lib/Soukai';
import { Database } from '@/lib/Engine';

import InvalidModelDefinition from '@/lib/errors/InvalidModelDefinition';

export interface Attributes {
    [attribute: string]: any;
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
    [field: string]: FieldDefinition
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

    public static boot<T extends Model>(name: string): void {
        const classDef = (<any> this);
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
            };
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
                            `Field ${field} field cannot be defined because it's being used as an automatic timestamp`
                        );
                    } else {
                        fieldDefinitions[field] = validateFieldDefinition(name, field, classDef.fields[field]);
                    }
                }
            }
        }

        classDef.fields = fieldDefinitions;
    }

    public static create<T extends Model>(attributes: Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static find<T extends Model>(id: Database.Key): Promise<T | null> {
        return Soukai.engine.readOne(this.collection, id)
            .then(document => new (<any>this)(convertFromDatabaseAttributes(document, this.fields), true))
            .catch(() => null);
    }

    public static all<T extends Model>(): Promise<T[]> {
        return Soukai.engine.readMany(this.collection)
            .then(documents => documents.map(document => new (<any>this)(convertFromDatabaseAttributes(document, this.fields), true)));
    }

    private static get instance(): Model {
        return new (<any> this)();
    }

    protected _exists: boolean;
    protected _attributes: Attributes;
    protected _dirtyAttributes: Attributes;
    protected _removedAttributes: string[];

    [attribute: string]: any;

    constructor(attributes: Attributes = {}, exists: boolean = false) {
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
        this._attributes = { ...this._attributes, ...attributes };
        this._dirtyAttributes = { ...this._dirtyAttributes, ...attributes };
        this.touch();

        return this.save();
    }

    public setAttribute(attribute: string, value: any): void {
        this._attributes[attribute] = value;
        this._dirtyAttributes[attribute] = value;
        this.touch();
    }

    public getAttribute(attribute: string): any {
        return this._attributes[attribute];
    }

    public unsetAttribute(attribute: string): void {
        if (this._attributes.hasOwnProperty(attribute)) {
            delete this._attributes[attribute];
            this._removedAttributes.push(attribute);
            this.touch();
        }
    }

    public delete<T extends Model>(): Promise<T> {
        return Soukai.engine.delete(
            this.classDef.collection,
            this._attributes.id,
        )
            .then(() => {
                delete this._attributes.id;
                this._exists = false;

                return <any> this;
            });
    }

    public save<T extends Model>(): Promise<T> {
        if (this._exists) {
            return Soukai.engine.update(
                this.classDef.collection,
                this._attributes.id,
                convertToDatabaseAttributes(this._dirtyAttributes, this.classDef.fields),
                [...this._removedAttributes ],
            )
                .then(() => {
                    this._dirtyAttributes = {};
                    this._removedAttributes = [];

                    return <any> this;
                });
        } else {
            return Soukai.engine.create(
                this.classDef.collection,
                convertToDatabaseAttributes(this._attributes, this.classDef.fields),
            )
                .then(id => {
                    this._attributes.id = id;
                    this._dirtyAttributes = {};
                    this._removedAttributes = [];
                    this._exists = true;

                    return <any> this;
                });
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

function validateFieldDefinition(model: string, field: string, definition: any, hasRequired: boolean = true): FieldDefinition {
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
            type: FieldType.Object,
            fields: fieldDefinition,
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

    return databaseAttributes;
}

function convertToDatabaseAttribute(attribute: Attributes, definition: FieldDefinition): Database.Value | Database.Value[] | Database.Attributes {
    switch (definition.type) {
        case FieldType.Date:
            return attribute.getTime();
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

function convertFromDatabaseAttribute(attribute: Database.Value | Database.Value[] | Database.Attributes, definition: FieldDefinition): any {
    switch (definition.type) {
        case FieldType.Date:
            return new Date(<number> attribute);
        case FieldType.Object:
            return convertFromDatabaseAttributes(<Database.Attributes> attribute, <FieldsDefinition> definition.fields);
        case FieldType.Array:
            return (<Database.Value[]>attribute).map(attr => convertFromDatabaseAttribute(<Database.Value> attr, <FieldDefinition> definition.items));
        default:
            return attribute;
    }
}

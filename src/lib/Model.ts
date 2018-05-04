import InvalidModelDefinition from './errors/InvalidModelDefinition';
import Soukai from './Soukai';

export enum FieldType {
    Number = 'number',
    String = 'string',
    Boolean = 'boolean',
    Array = 'array',
    Object = 'object',
    Date = 'date',
    Key = 'key',
}

const TYPE_VALUES = Object.values(FieldType);

const TIMESTAMP_FIELDS = ['created_at', 'updated_at'];

export interface FieldDefinition {

    type: FieldType;
    required: boolean;

    // Used with FieldType.Array
    items?: FieldDefinition;

    // Used with FieldType.Object
    fields?: {
        [field: string]: FieldDefinition,
    };

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

export default abstract class Model {

    public static collection: string;

    public static timestamps: string[] | boolean;

    public static fields: { [field: string]: FieldDefinition } | any;

    public static boot<T extends Model>(name: string): void {
        const classDef = (<any> this);
        const fieldDefinitions: { [field: string]: FieldDefinition } = {};

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

    public static create<T extends Model>(attributes: Soukai.Attributes = {}): Promise<T> {
        const model = new (<any> this)(attributes);
        return model.save();
    }

    public static find<T extends Model>(id: Soukai.PrimaryKey): Promise<T | null> {
        return Soukai.engine.readOne(this.collection, id)
            .then(attributes => new (<any> this)(attributes, true))
            .catch(() => null);
    }

    public static all<T extends Model>(): Promise<T[]> {
        return Soukai.engine.readMany(this.collection)
            .then(models => models.map(attributes => new (<any> this)(attributes, true)));
    }

    private get classDef(): typeof Model {
        return (<any> this.constructor);
    }

    private static get instance(): Model {
        return new (<any> this)();
    }

    private exists: boolean;
    private attributes: Soukai.Attributes | Soukai.Document;
    private dirtyAttributes: Soukai.Attributes;
    private removedAttributes: string[];

    [attribute: string]: any;

    constructor(attributes: Soukai.Attributes | Soukai.Document, exists = false) {
        this.exists = exists;
        this.attributes = {...attributes};
        this.dirtyAttributes = exists ? {} : {...attributes};
        this.removedAttributes = [];

        return new Proxy(this, {
            get(target, key) {
                if (key in target) {
                    return target[key];
                } else if (key in target.attributes) {
                    return target.attributes[key];
                } else {
                    return undefined;
                }
            },
        });
    }

    public update<T extends Model>(attributes: Soukai.Attributes): Promise<T> {
        this.attributes = { ...this.attributes, ...attributes };
        this.dirtyAttributes = { ...this.dirtyAttributes, ...attributes };

        return this.save();
    }

    public setAttribute(attribute: string, value: any): void {
        this.attributes[attribute] = value;
        this.dirtyAttributes[attribute] = value;
    }

    public unsetAttribute(attribute: string): void {
        if (this.attributes.hasOwnProperty(attribute)) {
            delete this.attributes[attribute];
            this.removedAttributes.push(attribute);
        }
    }

    public delete<T extends Model>(): Promise<T> {
        return Soukai.engine.delete(
            this.classDef.collection,
            this.attributes.id,
        )
            .then(() => {
                delete this.attributes.id;
                this.exists = false;

                return <any> this;
            });
    }

    public save<T extends Model>(): Promise<T> {
        if (this.exists) {
            return Soukai.engine.update(
                this.classDef.collection,
                this.attributes.id,
                { ...this.dirtyAttributes },
                [ ...this.removedAttributes],
            )
                .then(() => {
                    this.dirtyAttributes = {};
                    this.removedAttributes = [];

                    return <any> this;
                });
        } else {
            return Soukai.engine.create(
                this.classDef.collection,
                { ...this.attributes },
            )
                .then(id => {
                    this.attributes.id = id;
                    this.dirtyAttributes = {};
                    this.removedAttributes = [];
                    this.exists = true;

                    return <any> this;
                });
        }
    }

}

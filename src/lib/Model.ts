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

export interface FieldDefinition {

    type: FieldType;
    required: boolean;

    // Used with FieldType.Array
    item?: FieldDefinition;

    // Used with FieldType.Object
    fields?: {
        [field: string]: FieldDefinition,
    };

    // Custom field properties
    [prop: string]: any;

}

function validateFieldDefinition(model: string, field: string, definition: any): FieldDefinition {
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

    fieldDefinition.required = !!fieldDefinition.required;

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
            if (typeof fieldDefinition.item !== 'undefined') {
                fieldDefinition.item = validateFieldDefinition(model, 'item', fieldDefinition.item);
            } else {
                throw new InvalidModelDefinition(
                    model,
                    `Field definition of type array requires item attribute ${field}`,
                );
            }
            break;
    }

    return fieldDefinition;
}

export default abstract class Model {

    public static collection: string;

    public static fieldDefinitions: { [field: string]: FieldDefinition };

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
        if (typeof classDef.timestamps === 'boolean') {
            if (classDef.timestamps) {
                fieldDefinitions.created_at = { type: FieldType.Date, required: false, auto: true };
                fieldDefinitions.updated_at = { type: FieldType.Date, required: false, auto: true };
            }
        } else if (typeof classDef.timestamps !== 'undefined' && Array.isArray(classDef.timestamps)) {
            classDef.timestamps.each(field => {
                if (!(field in ['created_at', 'updated_at'])) {
                    throw new InvalidModelDefinition(name, `Invalid timestamp field defined (${field})`);
                }

                fieldDefinitions[field] = { type: FieldType.Date, required: false, auto: true };
            });
        }

        // Validate fields
        if (typeof classDef.fields !== 'undefined') {
            for (const field in classDef.fields) {
                if (classDef.fields.hasOwnProperty(field)) {
                    fieldDefinitions[field] = validateFieldDefinition(name, field, classDef.fields[field]);
                }
            }
        }

        classDef.fieldDefinitions = fieldDefinitions;
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
        return Soukai.engine.readAll(this.collection)
            .then(models => models.map(attributes => new (<any> this)(attributes, true)));
    }

    protected get classDef(): typeof Model {
        return (<any> this.constructor);
    }

    protected static get instance(): Model {
        return new (<any> this)();
    }

    protected attributes: Soukai.Attributes | Soukai.Document;
    protected dirty: Soukai.Attributes;
    protected exists: boolean;

    constructor(attributes: Soukai.Attributes | Soukai.Document, exists = false) {
        this.attributes = {...attributes};
        this.exists = exists;
        this.dirty = exists ? {} : {...attributes};

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
        this.dirty = { ...this.dirty, ...attributes };

        return this.save();
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
                this.dirty,
            )
                .then(() => {
                    this.dirty = {};

                    return <any> this;
                });
        } else {
            return Soukai.engine.create(
                this.classDef.collection,
                this.attributes,
            )
                .then(id => {
                    this.attributes.id = id;
                    this.dirty = {};
                    this.exists = true;

                    return <any> this;
                });
        }
    }

}

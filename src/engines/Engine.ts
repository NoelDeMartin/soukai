type EngineAttributePrimitiveValue = string | number | boolean | null | Date;

type EngineAttributeValue = EngineAttributePrimitiveValue | EngineAttributePrimitiveValue[];

export interface EngineAttributes {
    [field: string]: EngineAttributeValue | EngineAttributes | EngineAttributes[];
}

export interface Documents {
    [id: string]: EngineAttributes;
}

export interface Filters {
    $in?: string[];

    [field: string]:
        { $contains: any[] } |
        any;
}

export default interface Engine {

    create(collection: string, attributes: EngineAttributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<EngineAttributes>;

    readMany(collection: string, filters?: Filters): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: EngineAttributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

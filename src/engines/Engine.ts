type AttributePrimitiveValue = string | number | boolean | null | Date;

type AttributeValue = AttributePrimitiveValue | AttributePrimitiveValue[];

export interface Attributes {
    [field: string]: AttributeValue | Attributes | Attributes[];
}

export interface Documents {
    [id: string]: Attributes;
}

export interface Filters {
    [field: string]:
        { $contains: any[] } |
        any;
}

export default interface Engine {

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string, filters?: Filters): Promise<Documents>;

    update(
        collection: string,
        id: string,
        updatedAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

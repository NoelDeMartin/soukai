type AttributeValue = string | number | boolean | null | Date;

export interface Attributes {
    [field: string]: AttributeValue | AttributeValue[] | Attributes;
}

export interface Filters {
    [field: string]: any;
}

export default interface Engine {

    create(collection: string, attributes: Attributes, id?: string): Promise<string>;

    readOne(collection: string, id: string): Promise<Attributes>;

    readMany(collection: string, filters?: Filters): Promise<Attributes[]>;

    update(
        collection: string,
        id: string,
        dirtyAttributes: Attributes,
        removedAttributes: string[],
    ): Promise<void>;

    delete(collection: string, id: string): Promise<void>;

}

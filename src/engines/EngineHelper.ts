import {
    EngineAttributeFilter,
    EngineAttributeUpdate,
    EngineAttributeValue,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdates,
} from '@/engines/Engine';

import { deepEquals, isObject } from '@/internal/utils/Obj';

import Arr from '@/internal/utils/Arr';
import UUID from '@/internal/utils/UUID';

type AttributesMap = MapObject<EngineAttributeValue>;
type RootFilterHandler = (id: string, document: EngineDocument, filterData: any) => boolean;
type AttributeFilterHandler = (attributes: AttributesMap, attribute: string, filterData: any) => boolean;
type AttributeUpdateHandler = (attributes: AttributesMap, attribute: string, updateData: any) => void;

export default class EngineHelper {

    private rootFilters: MapObject<RootFilterHandler>;
    private attributeFilters: MapObject<AttributeFilterHandler>;
    private attributeUpdates: MapObject<AttributeUpdateHandler>;

    public constructor() {
        this.rootFilters = {
            $in: this.documentsIn,
        };
        this.attributeFilters = {
            $eq: this.attributeEq,
            $contains: this.attributeContains,
            $or: this.attributeOr,
        };
        this.attributeUpdates = {
            $update: this.attributeUpdate,
            $updateItems: this.attributeUpdateItems,
            $push: this.attributePush,
        };
    }

    public filterDocuments(
        documents: EngineDocumentsCollection,
        filters: EngineFilters = {},
    ): EngineDocumentsCollection {
        return Object.entries(documents).reduce((filteredDocuments, [id, document]) => {
            if (this.filterDocument(id, document, filters)) {
                filteredDocuments[id] = document;
            }

            return filteredDocuments;
        }, {});
    }

    public updateAttributes(attributes: MapObject<EngineAttributeValue>, updates: EngineUpdates): void {
        for (const [attribute, value] of Object.entries(updates)) {
            this.attributeUpdate(attributes, attribute, value);
        }
    }

    public removeAttributes(attributes: MapObject<EngineAttributeValue>, removedAttributes: string[][]): void {
        for (const attributePath of removedAttributes) {
            let object: object = attributes;
            const attributesLeft = [...attributePath].reverse();

            while (attributesLeft.length > 1) {
                object = object[attributesLeft.pop() as string];
            }

            delete object[attributesLeft.pop() as string];
        }
    }

    public obtainDocumentId(id?: string): string {
        return id || UUID.generate();
    }

    private filterDocument(id: string, document: EngineDocument, filters: EngineFilters = {}): boolean {
        filters = { ...filters };

        const rootFilters = Object.keys(filters).filter(filter => filter in this.rootFilters);

        for (const rootFilter of rootFilters) {
            if (!this.rootFilters[rootFilter](id, document, filters[rootFilter])) {
                return false;
            }

            delete filters[rootFilter];
        }

        return this.filterValue(document, filters);
    }

    private filterValue(value: EngineAttributeValue, filters: EngineAttributeFilter = {}): boolean {
        if (!isObject(filters)) {
            return this.attributeEq({ value }, 'value', filters);
        }

        if (this.isOperation(filters, this.attributeFilters)) {
            return this.runOperation(filters, this.attributeFilters, { value }, 'value');
        }

        if (!isObject(value)) {
            return false;
        }

        return !Object.entries(filters)
            .find(([filterAttribute, filterValue]) => {
                const matchesFilter =
                    this.isOperation(filterValue, this.attributeFilters)
                        ? this.runOperation(filterValue, this.attributeFilters, value, filterAttribute)
                        : this.attributeEq(value as MapObject<EngineAttributeValue>, filterAttribute, filterValue);

                return !matchesFilter;
            });
    }

    private documentsIn = (id: string, _: EngineDocument, ids: string[]): boolean => {
        return Arr.contains(ids, id);
    }

    private attributeEq = (
        attributes: AttributesMap,
        attribute: string,
        filterValue: EngineAttributeValue,
    ): boolean => {
        return deepEquals(attributes[attribute], filterValue);
    }

    private attributeContains = (
        attributes: AttributesMap,
        attribute: string,
        filters: EngineAttributeFilter | EngineAttributeFilter[],
    ): boolean => {
        if (!Array.isArray(filters)) {
            filters = [filters];
        }

        const attributeItems = attributes && attributes[attribute] as EngineAttributeValue[];
        if (!Array.isArray(attributeItems)) {
            return false;
        }

        return !(filters as EngineAttributeFilter[]).find(
            filter => !attributeItems.find(item => this.filterValue(item, filter)),
        );
    }

    private attributeOr = (attributes: AttributesMap, attribute: string, filters: EngineAttributeFilter[]): boolean => {
        return !!filters.find(
            filter => !!this.filterValue(attributes, { [attribute]: filter }),
        );
    }

    private attributeUpdate = (attributes: AttributesMap, attribute: string, updateData: EngineAttributeUpdate) => {
        if (!isObject(updateData)) {
            attributes[attribute] = updateData;

            return;
        }

        if (this.isOperation(updateData, this.attributeUpdates)) {
            this.runOperation<void, MapObject<AttributeUpdateHandler>>(
                updateData,
                this.attributeUpdates,
                attributes,
                attribute,
            );

            return;
        }

        if (!isObject(attributes[attribute])) {
            attributes[attribute] = updateData as EngineAttributeValue;

            return;
        }

        this.updateAttributes(
            attributes[attribute] as MapObject<EngineAttributeValue>,
            updateData as MapObject<EngineAttributeUpdate>,
        );
    }

    private attributeUpdateItems = (
        value: EngineAttributeValue,
        property: string,
        { $where, $update }: { $where?: EngineFilters, $update: EngineAttributeUpdate },
    ) => {
        if ($where && $where.$in) {
            $where.$in = $where.$in.map(index => index.toString());
        }

        const array = this.requireArrayProperty('$updateItems', value, property);
        const filteredDocuments = this.filterDocuments(
            array.reduce<EngineDocumentsCollection>(
                (documents, item, index) => ({
                    ...documents,
                    [index]: isObject(item) ? item : {},
                }),
                {},
            ),
            $where || {},
        );

        for (const index of Object.keys(filteredDocuments)) {
            this.updateAttributes(filteredDocuments, { [index]: $update });

            array[index] = filteredDocuments[index];
        }
    }

    private attributePush = (value: EngineAttributeValue, property: string, item: any) => {
        const array = this.requireArrayProperty('$push', value, property);

        array.push(item);
    }

    private isOperation(value: any, handlers: MapObject<(...params: any[]) => any>): boolean {
        if (!isObject(value)) {
            return false;
        }

        const [firstKey, ...otherKeys] = Object.keys(value);

        return !!(firstKey && otherKeys.length === 0 && firstKey in handlers);
    }

    private runOperation<R, H extends MapObject<(...params: any[]) => R>>(
        operation: { [key in keyof H]: any },
        handlers: H,
        ...params: any[]
    ): R {
        const [operator, data] = Object.entries(operation)[0];

        return handlers[operator](...params, data);
    }

    private requireArrayProperty(
        operator: string,
        value: EngineAttributeValue,
        property: string,
    ): EngineAttributeValue[] {
        if (!value || !Array.isArray(value[property])) {
            throw new Error(`${operator} operator can only be applied to array attributes`);
        }

        return value[property];
    }

}

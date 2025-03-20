import { arrayWithoutIndexes, deepEquals, isObject, uuid } from '@noeldemartin/utils';

import type {
    EngineAttributeFilter,
    EngineAttributeUpdate,
    EngineAttributeUpdateOperation,
    EngineAttributeValue,
    EngineAttributeValueMap,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdateItemsOperatorData,
    EngineUpdates,
} from 'soukai/engines/Engine';

type Handler<T = unknown> = (...params: any[]) => T;
type Operation<T extends Record<string, unknown> = Record<string, unknown>> = Record<keyof T, unknown>;
type AttributesMap = Record<string, EngineAttributeValue>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RootFilterHandler = (id: string, document: EngineDocument, filterData: any) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RootUpdateHandler = (document: EngineDocument, updateData: any) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttributeFilterHandler = (attributes: AttributesMap, attribute: string, filterData: any) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttributeUpdateHandler = (attributes: AttributesMap, attribute: string, updateData: any) => void;

export class EngineHelper {

    private rootFilters: Record<'$in', RootFilterHandler>;
    private rootUpdates: Record<'$overwrite', RootUpdateHandler>;
    private attributeFilters: Record<'$eq' | '$contains' | '$or' | '$in', AttributeFilterHandler>;
    private attributeUpdates: Record<
        '$update' |
        '$updateItems' |
        '$push' |
        '$unset' |
        '$apply' |
        '$overwrite',
        AttributeUpdateHandler
    >;

    public constructor() {
        this.rootFilters = {
            $in: this.documentsIn,
        };
        this.rootUpdates = {
            $overwrite: this.documentOverwrite,
        };
        this.attributeFilters = {
            $eq: this.attributeEq,
            $contains: this.attributeContains,
            $or: this.attributeOr,
            $in: this.attributeIn,
        };
        this.attributeUpdates = {
            $update: this.attributeUpdate,
            $updateItems: this.attributeUpdateItems,
            $push: this.attributePush,
            $unset: this.attributeUnset,
            $apply: this.attributeApply,
            $overwrite: this.attributeOverwrite,
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
        }, {} as Record<string, EngineDocument>);
    }

    public updateAttributes(attributes: Record<string, EngineAttributeValue>, updates: EngineUpdates): void {
        if (this.isOperation(updates, { $unset: this.attributeUnset })) {
            const unsetValue = (updates as { $unset: string | string[] }).$unset;
            const unsetProperties = Array.isArray(unsetValue) ? unsetValue : [unsetValue];

            for (const unsetProperty of unsetProperties) {
                this.attributeUnset(attributes, unsetProperty, true);
            }

            return;
        }

        if (this.isOperation(updates, this.rootUpdates)) {
            const [[operation, value]] = Object.entries(updates) as unknown as [
                [keyof typeof this.rootUpdates, RootUpdateHandler]
            ];

            this.rootUpdates[operation](attributes, value);

            return;
        }

        for (const [attribute, value] of Object.entries(updates as EngineUpdates)) {
            this.attributeUpdate(attributes, attribute, value);
        }
    }

    public obtainDocumentId(id?: string): string {
        return id ?? uuid();
    }

    private filterDocument(id: string, document: EngineDocument, filters: EngineFilters = {}): boolean {
        filters = { ...filters };

        for (const [filter, handler] of Object.entries(this.rootFilters)) {
            if (!(filter in filters))
                continue;

            if (!handler(id, document, filters[filter]))
                return false;

            delete filters[filter];
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
                        : this.attributeEq(value as Record<string, EngineAttributeValue>, filterAttribute, filterValue);

                return !matchesFilter;
            });
    }

    private documentsIn = (id: string, _: EngineDocument, ids: string[]): boolean => {
        return ids.includes(id);
    };

    private documentOverwrite = (document: EngineDocument, newValue: EngineDocument): void => {
        for (const column of Object.getOwnPropertyNames(document)){
            delete document[column];
        }

        Object.assign(document, newValue);
    };

    private attributeEq = (
        attributes: AttributesMap,
        attribute: string,
        filterValue: EngineAttributeValue,
    ): boolean => {
        return deepEquals(attributes[attribute], filterValue);
    };

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
    };

    private attributeOr = (attributes: AttributesMap, attribute: string, filters: EngineAttributeFilter[]): boolean => {
        return !!filters.find(
            filter => !!this.filterValue(attributes, { [attribute]: filter }),
        );
    };

    private attributeIn = (attributes: AttributesMap, attribute: string, values: unknown[]): boolean => {
        return values.includes(attributes[attribute]);
    };

    private attributeUpdate = (attributes: AttributesMap, attribute: string, updateData: EngineAttributeUpdate) => {
        if (Array.isArray(updateData) || !isObject(updateData)) {
            attributes[attribute] = updateData;

            return;
        }

        if (this.isOperation(updateData, this.attributeUpdates)) {
            this.runOperation<void, Record<string, AttributeUpdateHandler>>(
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
            attributes[attribute] as Record<string, EngineAttributeValue>,
            updateData as Record<string, EngineAttributeUpdate>,
        );
    };

    private attributeUpdateItems = (
        value: EngineAttributeValueMap,
        property: string,
        updateData: EngineUpdateItemsOperatorData | EngineUpdateItemsOperatorData[],
    ) => {
        if (!Array.isArray(updateData)) {
            updateData = [updateData];
        }

        for (const { $where, $update, $override, $unset } of updateData) {
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

            if ($update) {
                Object.keys(filteredDocuments).forEach(index => {
                    this.updateAttributes(filteredDocuments, { [index]: $update });

                    array[parseInt(index)] = filteredDocuments[index] as EngineDocument;
                });
            }

            if ($override) {
                Object.keys(filteredDocuments).forEach(index => {
                    array[parseInt(index)] = $override as EngineDocument;
                });
            }

            if ($unset) {
                value[property] = arrayWithoutIndexes(array, Object.keys(filteredDocuments).map(parseInt));
            }
        }
    };

    private attributePush = (value: EngineAttributeValue, property: string, item: EngineAttributeValue) => {
        const array = this.requireArrayProperty('$push', value, property);

        array.push(item);
    };

    private attributeUnset = (
        value: EngineAttributeValueMap,
        property: string,
        unsetProperties: string | string[] | true,
    ) => {
        if (unsetProperties === true) {
            delete value[property];

            return;
        }

        const propertyValue = value[property];

        if (!isObject(propertyValue))
            return;

        unsetProperties = Array.isArray(unsetProperties) ? unsetProperties : [unsetProperties];

        for (const unsetProperty of unsetProperties) {
            delete propertyValue[unsetProperty];
        }
    };

    private attributeApply = (
        value: EngineAttributeValue,
        property: string,
        operations: EngineAttributeUpdateOperation[],
    ) => {
        for (const operation of operations) {
            this.runOperation<void, Record<string, AttributeUpdateHandler>>(
                operation,
                this.attributeUpdates,
                value,
                property,
            );
        }
    };

    private attributeOverwrite = (
        value: EngineAttributeValueMap,
        property: string,
        newValue: EngineAttributeValue,
    ) => {
        value[property] = newValue;
    };

    private isOperation<H extends Record<string, Handler>>(value: unknown, handlers: H): value is Operation<H> {
        if (!isObject(value))
            return false;

        const [firstKey, ...otherKeys] = Object.keys(value);

        return !!(firstKey && otherKeys.length === 0 && firstKey in handlers);
    }

    private runOperation<R, H extends Record<string, Handler<R>>>(
        operation: Record<keyof H, unknown>,
        handlers: H,
        ...params: any[]
    ): R {
        const [operator, data] = Object.entries(operation)[0] as [keyof H, unknown];

        return (handlers[operator] as Handler<R>)(...params, data);
    }

    private requireArrayProperty(
        operator: string,
        value: EngineAttributeValue,
        property: string,
    ): EngineAttributeValue[] {
        if (!value || !isObject(value) || !Array.isArray(value[property])) {
            throw new Error(`${operator} operator can only be applied to array attributes`);
        }

        return value[property] as EngineAttributeValue[];
    }

}

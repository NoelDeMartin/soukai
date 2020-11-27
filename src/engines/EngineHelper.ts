import {
    EngineAttributeFilter,
    EngineAttributeUpdate,
    EngineAttributeUpdateOperation,
    EngineAttributeValue,
    EngineDocument,
    EngineDocumentsCollection,
    EngineFilters,
    EngineUpdateItemsOperatorData,
    EngineUpdates,
} from '@/engines/Engine';

import { deepEquals, isObject } from '@/internal/utils/Obj';

import Arr from '@/internal/utils/Arr';
import UUID from '@/internal/utils/UUID';

type AttributesMap = Record<string, EngineAttributeValue>;
type RootFilterHandler = (id: string, document: EngineDocument, filterData: any) => boolean;
type AttributeFilterHandler = (attributes: AttributesMap, attribute: string, filterData: any) => boolean;
type AttributeUpdateHandler = (attributes: AttributesMap, attribute: string, updateData: any) => void;

export default class EngineHelper {

    private rootFilters: Record<string, RootFilterHandler>;
    private attributeFilters: Record<string, AttributeFilterHandler>;
    private attributeUpdates: Record<string, AttributeUpdateHandler>;

    public constructor() {
        this.rootFilters = {
            $in: this.documentsIn,
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

    public updateAttributes(attributes: Record<string, EngineAttributeValue>, updates: EngineUpdates): void {
        if (this.isOperation(updates, { $unset: this.attributeUnset })) {
            const unsetValue = (updates as { $unset: string | string[ ]}).$unset;
            const unsetProperties = Array.isArray(unsetValue) ? unsetValue : [unsetValue];

            for (const unsetProperty of unsetProperties) {
                this.attributeUnset(attributes, unsetProperty, true);
            }

            return;
        }

        for (const [attribute, value] of Object.entries(updates)) {
            this.attributeUpdate(attributes, attribute, value);
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
                        : this.attributeEq(value as Record<string, EngineAttributeValue>, filterAttribute, filterValue);

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

    private attributeIn = (attributes: AttributesMap, attribute: string, values: any[]): boolean => {
        return Arr.contains(values, attributes[attribute]);
    }

    private attributeUpdate = (attributes: AttributesMap, attribute: string, updateData: EngineAttributeUpdate) => {
        if (!isObject(updateData)) {
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
    }

    private attributeUpdateItems = (
        value: EngineAttributeValue,
        property: string,
        updateData: EngineUpdateItemsOperatorData | EngineUpdateItemsOperatorData[],
    ) => {
        if (!Array.isArray(updateData)) {
            updateData = [updateData];
        }

        for (const { $where, $update, $unset } of updateData) {
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

                    array[index] = filteredDocuments[index];
                });
            }

            if ($unset) {
                value![property] = Arr.withoutIndexes(array, Object.keys(filteredDocuments).map(parseInt));
            }
        }
    }

    private attributePush = (value: EngineAttributeValue, property: string, item: any) => {
        const array = this.requireArrayProperty('$push', value, property);

        array.push(item);
    }

    private attributeUnset = (
        value: EngineAttributeValue,
        property: string,
        unsetProperties: string | string[] | true,
    ) => {
        if (unsetProperties === true) {
            delete value![property!];

            return;
        }

        unsetProperties = Array.isArray(unsetProperties) ? unsetProperties : [unsetProperties];

        for (const unsetProperty of unsetProperties) {
            delete value![property][unsetProperty];
        }
    }

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
    }

    private isOperation(value: any, handlers: Record<string, (...params: any[]) => any>): boolean {
        if (!isObject(value)) {
            return false;
        }

        const [firstKey, ...otherKeys] = Object.keys(value);

        return !!(firstKey && otherKeys.length === 0 && firstKey in handlers);
    }

    private runOperation<R, H extends Record<string, (...params: any[]) => R>>(
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

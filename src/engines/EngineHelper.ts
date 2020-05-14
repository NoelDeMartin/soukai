import { EngineDocument, EngineDocumentsCollection, EngineFilters } from '@/engines/Engine';

import { deepEquals } from '@/internal/utils/Obj';

import Arr from '@/internal/utils/Arr';
import UUID from '@/internal/utils/UUID';

type RootFilter = (id: string, document: EngineDocument, data: any) => boolean;
type AttributeFilter = (id: string, document: EngineDocument, attribute: string, data: any) => boolean;
type AttributeOperator = (document: EngineDocument, attribute: string, value: any) => void;

export default class EngineHelper {

    private rootFilters: {
        [filter: string]: RootFilter;
    };

    private attributeFilters: {
        [filter: string]: AttributeFilter;
    };

    private attributeOperators: {
        [operator: string]: AttributeOperator;
    };

    public constructor() {
        this.rootFilters = {
            $in: this.filterIn,
        };
        this.attributeFilters = {
            $eq: this.filterEq,
            $contains: this.filterContains,
            $or: this.filterOr,
        };
        this.attributeOperators = {
            $update: this.operatorUpdate,
            $push: this.operatorPush,
        };
    }

    public filterDocuments(
        documents: EngineDocumentsCollection,
        filters: EngineFilters = {},
    ): EngineDocumentsCollection {
        return Object.entries(documents).reduce((filteredDocuments, [id, document]) => {
            if (this.filterDocument(id, document, filters, true)) {
                filteredDocuments[id] = document;
            }

            return filteredDocuments;
        }, {});
    }

    public updateAttributes(document: EngineDocument, updatedAttributes: object): void {
        for (const [attribute, value] of Object.entries(updatedAttributes)) {
            this.operatorUpdate(document, attribute, value);
        }
    }

    public removeAttributes(document: EngineDocument, removedAttributes: string[][]): void {
        for (const attributePath of removedAttributes) {
            let object: object = document;
            const attributes = [...attributePath].reverse();

            while (attributes.length > 1) {
                object = object[attributes.pop() as string];
            }

            delete object[attributes.pop() as string];
        }
    }

    public obtainDocumentId(id?: string): string {
        return id || UUID.generate();
    }

    private filterDocument(
        id: string,
        document: EngineDocument,
        filters: EngineFilters = {},
        useRootFilters: boolean = false,
    ): boolean {
        return !Object.entries(filters)
            .find(([filterAttribute, filterValue]) => {
                if (useRootFilters && filterAttribute in this.rootFilters) {
                    return !this.rootFilters[filterAttribute](
                        id,
                        document,
                        filterValue,
                    );
                }

                const [key, ...otherKeys] = Object.keys(filterValue);
                const [attributeFilter, attributeFilterValue] =
                    (otherKeys.length === 0 && key in this.attributeFilters)
                        ? [this.attributeFilters[key], filterValue[key]]
                        : [this.filterEq, filterValue];

                return !attributeFilter(id, document, filterAttribute, attributeFilterValue);
            });
    }

    private filterIn = (id: string, _: EngineDocument, ids: string[]): boolean => {
        return Arr.contains(ids, id);
    }

    private filterEq = (
        _: string,
        document: EngineDocument,
        attribute: string,
        filterValue: any,
    ): boolean => {
        return deepEquals(document[attribute], filterValue);
    }

    private filterContains = (
        id: string,
        document: EngineDocument,
        attribute: string,
        filters: EngineFilters[],
    ): boolean => {
        if (!Array.isArray(filters)) {
            filters = [filters];
        }

        const items = document[attribute] as any[];
        if (!Array.isArray(items)) {
            return false;
        }

        return !filters.find(
            filter => !items.find(item => this.filterDocument(id, item, filter)),
        );
    }

    private filterOr = (
        id: string,
        document: EngineDocument,
        attribute: string,
        filters: EngineFilters[],
    ): boolean => {
        return !!filters.find(
            filter => !!this.filterDocument(id, document, { [attribute]: filter }),
        );
    }

    private operatorUpdate = (document: EngineDocument, attribute: string, value: any) => {
        if (typeof value === 'object') {
            const [key, ...otherKeys] = Object.keys(value);

            if ((otherKeys.length === 0 && key in this.attributeOperators)) {
                this.attributeOperators[key](document, attribute, value[key]);

                return;
            }

            this.updateAttributes(document[attribute] as EngineDocument, value);

            return;
        }

        document[attribute] = value;
    }

    private operatorPush = (document: EngineDocument, attribute: string, item: any) => {
        const array = document[attribute];

        if (!Array.isArray(array)) {
            throw new Error('$push operator can only be applied to array attributes');
        }

        (array as any[]).push(item);
    }

}

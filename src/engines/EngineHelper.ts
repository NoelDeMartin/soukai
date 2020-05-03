import { EngineDocumentsCollection, EngineFilters } from '@/engines/Engine';

import { deepEquals } from '@/internal/utils/Obj';
import UUID from '@/internal/utils/UUID';

export default class EngineHelper {

    private specialRootFilters: {
        [filter: string]: (
            documents: EngineDocumentsCollection,
            filter: any,
        ) => EngineDocumentsCollection;
    };

    private specialAttributeFilters: {
        [filter: string]: (
            documents: EngineDocumentsCollection,
            attribute: string,
            filter: any,
        ) => EngineDocumentsCollection;
    };

    public constructor() {
        this.specialRootFilters = {
            $in: this.filterIn,
        };
        this.specialAttributeFilters = {
            $eq: this.filterEq,
            $contains: this.filterContains,
            $or: this.filterOr,
        };
    }

    public filterDocuments(
        documents: EngineDocumentsCollection,
        filters: EngineFilters = {},
    ): EngineDocumentsCollection {
        documents = { ...documents };

        for (const attribute in filters) {
            if (attribute in this.specialRootFilters) {
                documents = this.specialRootFilters[attribute](documents, filters[attribute]);
                continue;
            }

            if (typeof filters[attribute] === 'object') {
                const keys = Object.keys(filters[attribute]);

                if (keys.length === 1 && keys[0] in this.specialAttributeFilters) {
                    documents = this.specialAttributeFilters[keys[0]](
                        documents,
                        attribute,
                        filters[attribute][keys[0]],
                    );
                    continue;
                }
            }

            documents = this.filterEq(documents, attribute, filters[attribute]);
        }

        return documents;
    }

    public obtainDocumentId(id?: string): string {
        return id || UUID.generate();
    }

    private filterEq = (
        documents: EngineDocumentsCollection,
        attribute: string,
        value: any,
    ): EngineDocumentsCollection => {
        documents = { ...documents };

        for (const id in documents) {
            const document = documents[id];

            if (!deepEquals(document[attribute], value)) {
                delete documents[id];
            }
        }

        return documents;
    }

    private filterIn = (documents: EngineDocumentsCollection, values: string[]): EngineDocumentsCollection => {
        const ids = Object.keys(documents);

        for (const id of ids) {
            if (values.indexOf(id) === -1) {
                delete documents[id];
                continue;
            }
        }

        return documents;
    }

    private filterContains = (
        documents: EngineDocumentsCollection,
        attribute: string,
        values: any[],
    ): EngineDocumentsCollection => {
        const ids = Object.keys(documents);

        for (const id of ids) {
            const documentValues = documents[id][attribute];

            if (!Array.isArray(documentValues) || !this.arrayContains(documentValues, values)) {
                delete documents[id];
                continue;
            }
        }

        return documents;
    }

    private filterOr = (
        documents: EngineDocumentsCollection,
        attribute: string,
        filters: any[],
    ): EngineDocumentsCollection => {
        return filters.reduce((filteredDocuments, filter) => ({
            ...filteredDocuments,
            ...this.filterDocuments(documents, { [attribute]: filter }),
        }), {});
    }

    private arrayContains(array: any[], values: any[]): boolean {
        for (const value of values) {
            if (!array.find(arrayValue => deepEquals(arrayValue, value))) {
                return false;
            }
        }

        return true;
    }

}

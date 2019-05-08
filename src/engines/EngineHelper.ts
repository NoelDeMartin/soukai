import { Documents, Filters } from '@/engines/Engine';

import { deepEquals } from '@/utils/Obj';
import UUID from '@/utils/UUID';

export default class EngineHelper {

    private specialRootFilters: {
        [filter: string]: (
            documents: Documents,
            filter: any,
        ) => Documents;
    };

    private specialAttributeFilters: {
        [filter: string]: (
            documents: Documents,
            attribute: string,
            filter: any,
        ) => Documents;
    };

    public constructor() {
        this.specialRootFilters = {
            $in: this.filterIn,
        };
        this.specialAttributeFilters = {
            $contains: this.filterContains,
        };
    }

    public filterDocuments(documents: Documents, filters: Filters = {}): Documents {
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

            for (const id in documents) {
                const document = documents[id];

                if (!deepEquals(document[attribute], filters[attribute])) {
                    delete documents[id];
                }
            }
        }

        return documents;
    }

    public getDocumentId(id?: string): string {
        return id || UUID.generate();
    }

    private filterIn = (documents: Documents, values: string[]): Documents => {
        const ids = Object.keys(documents);

        for (const id of ids) {
            if (values.indexOf(id) === -1) {
                delete documents[id];
                continue;
            }
        }

        return documents;
    }

    private filterContains = (documents: Documents, attribute: string, values: any[]): Documents => {
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

    private arrayContains(array: any[], values: any[]): boolean {
        for (const value of values) {
            if (!array.find(arrayValue => deepEquals(arrayValue, value))) {
                return false;
            }
        }

        return true;
    }

}

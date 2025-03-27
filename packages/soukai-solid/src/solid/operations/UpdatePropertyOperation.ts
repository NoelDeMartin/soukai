import type { RDFResourcePropertyType } from 'soukai-solid/solid/RDFResourceProperty';
import type RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';

import { OperationTypes } from './Operation';
import type Operation from './Operation';

export default class UpdatePropertyOperation implements Operation {

    public type: typeof OperationTypes.UpdateProperty = OperationTypes.UpdateProperty;
    public propertyOrProperties: RDFResourceProperty | ([RDFResourceProperty] & RDFResourceProperty[]);

    constructor(propertyOrProperties: RDFResourceProperty | RDFResourceProperty[]) {
        this.propertyOrProperties = propertyOrProperties as
            | RDFResourceProperty
            | ([RDFResourceProperty] & RDFResourceProperty[]);

        if (!Array.isArray(propertyOrProperties)) return;

        const [firstProperty, ...otherProperties] = propertyOrProperties;

        if (!firstProperty) throw new Error('Cannot create an UpdatePropertyOperation with an empty array');

        const { resourceUrl, name, type } = firstProperty;

        if (otherProperties.some((p) => p.resourceUrl !== resourceUrl || p.name !== name || p.type !== type))
            throw new Error(
                'All properties in an UpdatePropertyOperation must have the same resourceUrl, name and type',
            );
    }

    public get propertyResourceUrl(): string | null {
        return Array.isArray(this.propertyOrProperties)
            ? this.propertyOrProperties[0].resourceUrl
            : this.propertyOrProperties.resourceUrl;
    }

    public get propertyName(): string {
        return Array.isArray(this.propertyOrProperties)
            ? this.propertyOrProperties[0].name
            : this.propertyOrProperties.name;
    }

    public get propertyType(): RDFResourcePropertyType {
        return Array.isArray(this.propertyOrProperties)
            ? this.propertyOrProperties[0].type
            : this.propertyOrProperties.type;
    }

}

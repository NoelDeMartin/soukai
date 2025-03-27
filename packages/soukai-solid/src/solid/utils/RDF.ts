import type { JsonLD } from '@noeldemartin/solid-utils';

import IRI from 'soukai-solid/solid/utils/IRI';

class RDF {

    public getJsonLDProperty<T = unknown>(json: JsonLD, property: string): T | null {
        property = IRI(property);

        if (property in json) return this.getJsonLDPropertyValue(json[property]);

        if (!('@context' in json)) return null;

        const context = json['@context'] as Record<string, string>;
        const contextProperty = Object.entries(context).find(([_, url]) => property.startsWith(url));

        if (!contextProperty) return null;

        const propertyPrefix = contextProperty[0] === '@vocab' ? '' : `${contextProperty[0]}:`;
        const propertyValue = json[propertyPrefix + property.slice(contextProperty[1].length)];

        return this.getJsonLDPropertyValue(propertyValue);
    }

    private getJsonLDPropertyValue<T = unknown>(value: unknown): T | null {
        if (value === undefined) {
            return null;
        }

        return Array.isArray(value) && value.length === 1 ? value[0] : (value as T);
    }

}

export default new RDF();

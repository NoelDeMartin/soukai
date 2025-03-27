import { fail } from '@noeldemartin/utils';
import { ModelKey } from 'soukai';
import type {
    Attributes,
    EngineAttributeFilter,
    EngineAttributeUpdate,
    EngineDocument,
    EngineFilters,
    EngineUpdates,
} from 'soukai';
import type { JsonLD, JsonLDGraph } from '@noeldemartin/solid-utils';

import ResourceNotFound from 'soukai-solid/errors/ResourceNotFound';
import RDFDocument from 'soukai-solid/solid/RDFDocument';
import { RDFResourcePropertyType } from 'soukai-solid/solid/RDFResourceProperty';
import type RDFResourceProperty from 'soukai-solid/solid/RDFResourceProperty';

import JsonLDModelSerializer from 'soukai-solid/models/internals/JsonLDModelSerializer';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export type This = SolidModel;

export type SerializeOptions = Partial<{
    includeRelations: boolean;
    includeAnonymousHashes: boolean;
}>;

export default class SerializesToJsonLD {

    protected serializeToJsonLD(this: This, options: SerializeOptions = {}): JsonLD {
        options.includeRelations ??= true;

        return JsonLDModelSerializer.forModel(this.static()).serialize(this, options);
    }

    protected async parseEngineDocumentAttributesFromJsonLD(
        this: This,
        document: EngineDocument,
        resourceId: string,
    ): Promise<Attributes> {
        const jsonGraph = document as JsonLDGraph;
        const resourceJson =
            jsonGraph['@graph'].find((entity) => entity['@id'] === resourceId) ??
            fail(ResourceNotFound, resourceId, document.url);
        const resource = await RDFDocument.resourceFromJsonLDGraph(jsonGraph, resourceId, resourceJson);
        const fieldsDefinition = this.static('fields');
        const attributes: Attributes = {};

        attributes[this.static('primaryKey')] = resourceId;

        for (const [fieldName, fieldDefinition] of Object.entries(fieldsDefinition)) {
            if (!fieldDefinition.rdfProperty) continue;

            const properties =
                resource.propertiesIndex[fieldDefinition.rdfProperty] ??
                fieldDefinition.rdfPropertyAliases.reduce(
                    (props, rdfPropertyAlias) => props.concat(resource.propertiesIndex[rdfPropertyAlias] ?? []),
                    [] as RDFResourceProperty[],
                );
            const propertyValues = properties.map((property) =>
                property.type === RDFResourcePropertyType.Reference ? new ModelKey(property.value) : property.value);
            const [firstValue, ...otherValues] = propertyValues;

            if (typeof firstValue === 'undefined') continue;

            attributes[fieldName] = otherValues.length > 0 ? [firstValue, ...otherValues] : firstValue;
        }

        return attributes;
    }

    protected convertEngineFiltersToJsonLD(this: This, filters: EngineFilters, compactIRIs: boolean): EngineFilters {
        const jsonldFilters: EngineFilters = {};
        const serializer = JsonLDModelSerializer.forModel(this.static());
        const expandedTypes = this.static('rdfsClasses');
        const compactedTypes = expandedTypes.map((rdfClass) => serializer.processExpandedIRI(rdfClass));
        const typeFilters: EngineAttributeFilter[] = [];

        // TODO this should probably be refactored, because it doesn't make sense that
        // types are both expanded and compacted but filters aren't.
        if (expandedTypes.length > 0) {
            typeFilters.push({ $contains: compactedTypes });
            typeFilters.push({ $contains: expandedTypes });
        }

        if (expandedTypes.length === 1) {
            typeFilters.push({ $eq: compactedTypes[0] as string });
            typeFilters.push({ $eq: expandedTypes[0] as string });
        }

        this.static('rdfsClassesAliases').forEach((rdfsClassAliases) => {
            rdfsClassAliases.length > 0 && typeFilters.push({ $contains: rdfsClassAliases });
            rdfsClassAliases.length === 1 && typeFilters.push({ $eq: rdfsClassAliases[0] as string });
        });

        if (filters.$in) {
            jsonldFilters.$in = filters.$in;
            delete filters.$in;
        }

        const graphContainsFilters = this.convertAttributeValuesToJsonLD(filters, {
            compactIRIs,
            keepEmptyValues: false,
        }) as EngineFilters;

        if (typeFilters.length > 0) graphContainsFilters['@type'] = { $or: typeFilters };

        if (Object.keys(graphContainsFilters).length > 0) jsonldFilters['@graph'] = { $contains: graphContainsFilters };

        return jsonldFilters;
    }

    protected convertEngineUpdatesToJsonLD(this: This, updates: EngineUpdates, compactIRIs: boolean): EngineUpdates {
        const jsonLDUpdates = this.convertAttributeValuesToJsonLD(updates, {
            compactIRIs,
            keepEmptyValues: true,
        }) as Record<string, EngineAttributeUpdate>;

        for (const [field, value] of Object.entries(jsonLDUpdates)) {
            if (value !== null) {
                continue;
            }

            jsonLDUpdates[field] = { $unset: true };
        }

        return jsonLDUpdates;
    }

    private convertAttributeValuesToJsonLD(
        this: This,
        attributes: Attributes,
        options: { compactIRIs: boolean; keepEmptyValues: boolean },
    ): JsonLD {
        const serializer = JsonLDModelSerializer.forModel(this.static(), options.compactIRIs);

        return serializer.serialize(this, {
            includeContext: false,
            includeTypes: false,
            includeRelations: false,
            keepEmptyValues: options.keepEmptyValues,
            attributes,
        });
    }

}

import { arrayFilter, tap, toString } from '@noeldemartin/utils';
import { FieldType, SoukaiError } from 'soukai';
import type { Attributes, BootedArrayFieldDefinition } from 'soukai';
import type { JsonLD } from '@noeldemartin/solid-utils';

import { inferFieldDefinition } from 'soukai-solid/models/fields';
import { isSolidDocumentRelation, isSolidHasRelation } from 'soukai-solid/models/relations/guards';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';
import type { SolidBootedFieldDefinition, SolidBootedFieldsDefinition } from 'soukai-solid/models/fields';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidRelation } from 'soukai-solid/models/relations/inference';

class EmptyJsonLDValue {}

interface JsonLDContextTerm {
    name: string;
    compactingPrefix: string;
    value: string;
    used: boolean;
}

enum IRIFormat {
    Compacted = 'compacted',
    Expanded = 'expanded',
}

class JsonLDContext {

    public static fromRdfClasses(rdfContexts: Record<string, string>, rdfsProperties: string[]): JsonLDContext {
        const [defaultContext, ...otherContexts] = Object.entries(rdfContexts);
        const defaultTerm = {
            name: '@vocab',
            compactingPrefix: '',
            value: defaultContext?.[1] as string,
            used: true,
        };
        const terms = otherContexts.reduce(
            (termsIndex, [name, value]) => {
                if (value !== defaultTerm.value) {
                    termsIndex.push({
                        name,
                        value,
                        compactingPrefix: `${name}:`,
                        used: rdfsProperties.some((rdfProperty) => rdfProperty.startsWith(value)),
                    });
                }

                return termsIndex;
            },
            [defaultTerm],
        );

        return new JsonLDContext(terms);
    }

    private terms: JsonLDContextTerm[];
    private reverseProperties: Map<string, string>;

    private constructor(terms: JsonLDContextTerm[]) {
        this.terms = terms;
        this.reverseProperties = new Map();
    }

    public addReverseProperty(alias: string, value: string): void {
        this.reverseProperties.set(alias, value);
    }

    public addTerms(rdfContexts: Record<string, string>, rdfsProperties: string[]): void {
        for (const [name, value] of Object.entries(rdfContexts)) {
            const existingTerm = this.terms.find((term) => term.value === value);

            if (existingTerm) {
                existingTerm.used ||= rdfsProperties.some((rdfProperty) => rdfProperty.startsWith(value));

                continue;
            }

            let termName = name;
            let counter = 1;

            while (this.terms.some((term) => term.name === termName)) {
                termName = `${name}${++counter}`;
            }

            this.terms.push({
                name,
                value,
                compactingPrefix: `${name}`,
                used: rdfsProperties.some((rdfProperty) => rdfProperty.startsWith(value)),
            });
        }
    }

    public getTermForExpandedIRI(expandedIRI: string): JsonLDContextTerm | null {
        return this.terms.find((term) => expandedIRI.startsWith(term.value)) ?? null;
    }

    public render(): Record<string, unknown> {
        const rendered = this.terms.reduce(
            (_rendered, term) => {
                if (term.used) {
                    _rendered[term.name] = term.value;
                }

                return _rendered;
            },
            {} as Record<string, unknown>,
        );

        this.reverseProperties.forEach((reversePropertyValue, reversePropertyAlias) => {
            rendered[reversePropertyAlias] = { '@reverse': reversePropertyValue };
        });

        return rendered;
    }

}

export type SerializeOptions = Partial<{
    includeRelations: boolean;
    includeContext: boolean;
    includeTypes: boolean;
    includeAnonymousHashes: boolean;
    keepEmptyValues: boolean;
    attributes: Attributes;
    ignoreModels: Set<SolidModel>;
}>;

export default class JsonLDModelSerializer {

    public static forModel(model: typeof SolidModel, compactsIRIs: boolean = true): JsonLDModelSerializer {
        const bootedFields = model.fields as SolidBootedFieldsDefinition;
        const fieldsRdfProperties = arrayFilter(
            Object.values(bootedFields).map((definition) => definition.rdfProperty),
        );
        const context = JsonLDContext.fromRdfClasses(model.rdfContexts, fieldsRdfProperties);

        return new JsonLDModelSerializer(context, compactsIRIs ? IRIFormat.Compacted : IRIFormat.Expanded);
    }

    private context: JsonLDContext;
    private iriFormat: IRIFormat;

    private constructor(context: JsonLDContext, iriFormat: IRIFormat) {
        this.context = context;
        this.iriFormat = iriFormat;
    }

    public serialize(model: SolidModel, options: SerializeOptions = {}): JsonLD {
        const attributes = options.attributes ?? model.getAttributes();
        const ignoredModels = new Set(options.ignoreModels ?? []);
        const jsonld: JsonLD = { '@context': {}, '@type': null };

        ignoredModels.add(model);

        for (const [field, value] of Object.entries(attributes)) {
            this.setJsonLDField(jsonld, model, field, value, options);
        }

        if (!(model.static('primaryKey') in attributes) && options.includeAnonymousHashes) {
            const defaultResourceHash = model.static('defaultResourceHash');

            if (defaultResourceHash && !usingExperimentalActivityPods()) {
                jsonld['@id'] = `#${defaultResourceHash}`;
            }
        }

        if (options.includeRelations ?? true) {
            this.setJsonLDRelations(jsonld, model, ignoredModels);
        }

        if (options.includeTypes ?? true) {
            this.setJsonLDTypes(jsonld, model);
        } else {
            delete jsonld['@type'];
        }

        if (options.includeContext ?? true) {
            this.setJsonLDContext(jsonld);
        } else {
            delete jsonld['@context'];
        }

        return jsonld;
    }

    public processExpandedIRI(expandedIRI: string): string {
        return this.iriFormat === IRIFormat.Expanded ? expandedIRI : this.compactExpandedIRI(expandedIRI);
    }

    private compactExpandedIRI(expandedIRI: string): string {
        const term = this.context.getTermForExpandedIRI(expandedIRI);

        return term
            ? tap(term.compactingPrefix + expandedIRI.slice(term.value.length), () => (term.used = true))
            : expandedIRI;
    }

    private setJsonLDField(
        jsonld: JsonLD,
        model: SolidModel,
        field: string,
        value: unknown,
        options: SerializeOptions,
    ): void {
        if (field === model.static('primaryKey')) {
            jsonld['@id'] = toString(value);

            return;
        }

        const property = model.static().getFieldRdfProperty(field);

        if (!property) return;

        this.setJsonLDProperty(jsonld, model, this.processExpandedIRI(property), field, value, options);
    }

    private setJsonLDRelations(jsonld: JsonLD, model: SolidModel, ignoredModels: Set<SolidModel>): void {
        for (const relationName of model.static('relations')) {
            const relation = model.requireRelation<SolidRelation>(relationName);
            const loadedModel = relation.getLoadedModels()[0];

            if (
                !relation.enabled ||
                !relation.loaded ||
                !isSolidDocumentRelation(relation) ||
                relation.isEmpty() ||
                (loadedModel && ignoredModels.has(loadedModel))
            ) {
                continue;
            }

            const bootedFields = relation.relatedClass.fields as SolidBootedFieldsDefinition;
            const fieldsRdfProperties = arrayFilter(
                Object.values(bootedFields).map((definition) => definition.rdfProperty),
            );

            this.context.addTerms(relation.relatedClass.rdfContexts, fieldsRdfProperties);
            this.setJsonLDRelation(jsonld, relation, ignoredModels);
        }
    }

    private setJsonLDRelation(jsonld: JsonLD, relation: SolidRelation, ignoredModels: Set<SolidModel>): void {
        const relatedInstance = relation.relatedClass.instance() as SolidModel;
        const relatedModels = relation.related;
        const solidHasRelation = isSolidHasRelation(relation);
        const expandedForeignProperty = solidHasRelation
            ? relatedInstance.static().getFieldRdfProperty(relation.foreignKeyName)
            : relation.parent.static().getFieldRdfProperty(relation.foreignKeyName);
        const foreignProperty = this.processExpandedIRI(expandedForeignProperty as string);
        const serializeOptions: SerializeOptions = {
            ignoreModels: ignoredModels,
            includeRelations: true,
            includeContext: false,
        };
        const serializeRelatedModel = !solidHasRelation
            ? (model: SolidModel) => this.serialize(model, serializeOptions)
            : (model: SolidModel) =>
                tap(this.serialize(model, serializeOptions), (_jsonld) => {
                    delete _jsonld[foreignProperty];
                });

        if (!relatedModels) {
            return;
        }

        if (solidHasRelation) {
            this.context.addReverseProperty(relation.name, foreignProperty);
        }

        jsonld[solidHasRelation ? relation.name : foreignProperty] = Array.isArray(relatedModels)
            ? relatedModels.map((model) => serializeRelatedModel(model))
            : serializeRelatedModel(relatedModels);
    }

    private setJsonLDTypes(jsonld: JsonLD, model: SolidModel): void {
        const types = model.static('rdfsClasses').map((rdfsClass) => this.processExpandedIRI(rdfsClass));

        jsonld['@type'] = types.length === 1 ? types[0] : types;
    }

    private setJsonLDContext(jsonld: JsonLD): void {
        jsonld['@context'] = this.context.render();
    }

    private setJsonLDProperty(
        jsonld: JsonLD,
        model: SolidModel,
        name: string,
        field: string,
        value: unknown,
        options: SerializeOptions,
    ): void {
        value = this.castJsonLDValue(value, model.static().getFieldDefinition(field, value));

        if (value instanceof EmptyJsonLDValue) {
            if (options.keepEmptyValues) {
                jsonld[name] = null;
            }

            return;
        }

        jsonld[name] = value;
    }

    private castJsonLDValue(value: unknown, fieldDefinition: SolidBootedFieldDefinition): unknown {
        switch (fieldDefinition.type) {
            case FieldType.Any: {
                if (value === null || value === undefined) {
                    return new EmptyJsonLDValue();
                }

                const inferredFieldDefinition = inferFieldDefinition(
                    value,
                    fieldDefinition.rdfProperty,
                    fieldDefinition.rdfPropertyAliases,
                    fieldDefinition.required,
                );

                if (inferredFieldDefinition.type === FieldType.Any) {
                    throw new SoukaiError('Couldn\'t infer field definition for a field declared as any');
                }

                return this.castJsonLDValue(value, inferredFieldDefinition);
            }
            case FieldType.Key:
                return { '@id': toString(value) };
            case FieldType.Date:
                if (typeof value === 'object' && value !== null && '$unset' in value) {
                    return value;
                }

                return {
                    '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
                    '@value': new Date(value as string).toISOString(),
                };
            case FieldType.Array: {
                const arrayValue = value as unknown[];
                const itemsFieldDefinition = (fieldDefinition as BootedArrayFieldDefinition)
                    .items as SolidBootedFieldDefinition;

                switch (arrayValue.length) {
                    case 0:
                        return new EmptyJsonLDValue();
                    case 1:
                        return this.castJsonLDValue(arrayValue[0], itemsFieldDefinition);
                    default:
                        return arrayValue.map((itemValue) => this.castJsonLDValue(itemValue, itemsFieldDefinition));
                }
            }
            // TODO handle nested objects
            default:
                return JSON.parse(JSON.stringify(value));
        }
    }

}

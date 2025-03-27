import { arrayDiff, isInstanceOf, objectWithoutEmpty, requireUrlParentDirectory, tap } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai';
import type { EngineAttributeUpdate, EngineAttributeUpdateOperation, EngineAttributeValueMap } from 'soukai';
import type { Nullable } from '@noeldemartin/utils';

import type Operation from 'soukai-solid/models/history/Operation';
import { bootSolidSchemaDecoupled } from 'soukai-solid/models/internals/helpers';
import { operationClass } from 'soukai-solid/models/history/operations';
import { CRDT_PROPERTY, CRDT_RESOURCE } from 'soukai-solid/solid/constants';
import type { SolidModel } from 'soukai-solid/models/SolidModel';
import type { SolidModelConstructor } from 'soukai-solid/models/inference';
import type { SolidSchemaDefinition } from 'soukai-solid/models/fields';

export interface MigrateSchemaOptions {
    mintOperationUrl?(operation: Operation): Nullable<string>;
}

export type This = SolidModel;

export default class MigratesSchemas {

    public async migrateSchema<T extends SolidModel>(
        this: This,
        schema: SolidSchemaDefinition | SolidModelConstructor<T>,
        options: MigrateSchemaOptions = {},
    ): Promise<T> {
        if (this.isDirty()) {
            throw new SoukaiError('Can\'t migrate dirty model, call save() before proceeding.');
        }

        const bootedSchema = bootSolidSchemaDecoupled(schema, this.static());
        const { model, updates } = await this.getSchemaUpdates(bootedSchema, options);

        await this.updateEngineDocumentSchema(updates);

        return model as T;
    }

    protected async getSchemaUpdates<T extends SolidModel>(
        this: This,
        schema: SolidModelConstructor<T>,
        options: MigrateSchemaOptions,
    ): Promise<{ model: T; updates: EngineAttributeUpdateOperation[] }> {
        const { removed: removedFields, added: addedFields } = arrayDiff(
            Object.keys(this.static().fields),
            Object.keys(schema.fields),
        );

        const model = await this.newInstanceForSchema(schema, addedFields, removedFields);
        const dirtyUrl = model.url !== this.url ? model.url : null;
        const updates = [
            ...(await this.getOperationSchemaUpdates(model, removedFields, dirtyUrl, options)),
            ...this.getMetadataSchemaUpdates(dirtyUrl),
            ...this.getUrlSchemaUpdates(dirtyUrl),
            this.getResourceSchemaUpdate(model, dirtyUrl),
        ];

        return { model, updates };
    }

    protected async newInstanceForSchema<T extends SolidModel>(
        this: This,
        schema: SolidModelConstructor<T>,
        addedFields: string[],
        removedFields: string[],
    ): Promise<T> {
        const PropertyOperation = operationClass('PropertyOperation');
        const model = schema.newInstance(
            tap(this.getAttributes(), (attributes) => {
                attributes['url'] = `${this.requireDocumentUrl()}#${schema.defaultResourceHash}`;

                for (const removedField of removedFields) {
                    delete attributes[removedField];
                }
            }),
            true,
        );

        model.setRelationModels(
            'operations',
            this.operations.filter((operation) => {
                if (!isInstanceOf(operation, PropertyOperation)) {
                    return true;
                }

                const field = this.static().getRdfPropertyField(operation.property);

                return !field || !removedFields.includes(field);
            }),
        );

        addedFields.forEach((field) => {
            if (!model.hasAttribute(field)) {
                return;
            }

            model._dirtyAttributes[field] = model.getAttributeValue(field);
        });

        await model.static().hooks?.beforeSave?.call(model);

        if (model.operations.length > 0) {
            await model.addDirtyHistoryOperations();
        }

        return model;
    }

    protected async getOperationSchemaUpdates(
        this: This,
        model: SolidModel,
        removedFields: string[],
        dirtyUrl: Nullable<string>,
        options: MigrateSchemaOptions,
    ): Promise<EngineAttributeUpdateOperation[]> {
        const operationUrls: string[] = [];
        const graphUpdates: EngineAttributeUpdateOperation[] = [];
        const PropertyOperation = operationClass('PropertyOperation');
        const crdtResource = this.usingSolidEngine() ? CRDT_RESOURCE : 'resource';
        const crdtProperty = this.usingSolidEngine() ? CRDT_PROPERTY : 'property';

        await model.loadRelationIfUnloaded('operations');

        for (const operation of model.operations) {
            operationUrls.push(operation.url);

            if (!operation.exists()) {
                operation.date = this.getUpdatedAtAttribute();
                operation.resourceUrl = model.url;

                const url = options.mintOperationUrl?.(operation);

                if (url) {
                    operation.url = url;
                } else {
                    operation.mintUrl();
                }

                graphUpdates.push({
                    $push: operation.serializeToJsonLD({
                        includeRelations: false,
                        includeAnonymousHashes: true,
                    }) as EngineAttributeValueMap,
                });

                continue;
            }

            if (!isInstanceOf(operation, PropertyOperation)) {
                if (dirtyUrl) {
                    graphUpdates.push({
                        $updateItems: {
                            $where: { '@id': operation.url },
                            $update: {
                                [crdtResource]: { '@id': dirtyUrl },
                            },
                        },
                    });
                }

                continue;
            }

            const field = this.static().getRdfPropertyField(operation.property);
            const newProperty = field && model.static().getFieldRdfProperty(field);
            const updates = objectWithoutEmpty({
                [crdtResource]: dirtyUrl ? { '@id': dirtyUrl } : null,
                [crdtProperty]: newProperty && newProperty !== operation.property ? { '@id': newProperty } : null,
            });

            if (Object.keys(updates).length === 0) {
                continue;
            }

            graphUpdates.push({
                $updateItems: {
                    $where: { '@id': operation.url },
                    $update: updates as EngineAttributeUpdate,
                },
            });
        }

        for (const operation of this.operations) {
            if (operationUrls.includes(operation.url)) {
                continue;
            }

            graphUpdates.push({
                $updateItems: {
                    $where: { '@id': operation.url },
                    $unset: true,
                },
            });
        }

        return graphUpdates;
    }

    protected getMetadataSchemaUpdates(this: This, dirtyUrl: Nullable<string>): EngineAttributeUpdateOperation[] {
        if (!dirtyUrl || !this.metadata) {
            return [];
        }

        const crdtResource = this.usingSolidEngine() ? CRDT_RESOURCE : 'resource';

        return [
            {
                $updateItems: {
                    $where: { '@id': this.metadata.url },
                    $update: {
                        [crdtResource]: { '@id': dirtyUrl },
                    },
                },
            },
        ];
    }

    protected getUrlSchemaUpdates(this: This, dirtyUrl: Nullable<string>): EngineAttributeUpdateOperation[] {
        if (!dirtyUrl) {
            return [];
        }

        return [
            {
                $updateItems: {
                    $where: { '@id': this.url },
                    $update: { '@id': dirtyUrl },
                },
            },
        ];
    }

    protected getResourceSchemaUpdate(
        this: This,
        model: SolidModel,
        dirtyUrl?: Nullable<string>,
    ): EngineAttributeUpdateOperation {
        return {
            $updateItems: {
                $where: { '@id': dirtyUrl ?? this.url },
                $override: model.serializeToJsonLD({
                    includeRelations: false,
                    includeAnonymousHashes: true,
                }) as EngineAttributeValueMap,
            },
        };
    }

    protected async updateEngineDocumentSchema(
        this: This,
        graphUpdates: EngineAttributeUpdateOperation[],
    ): Promise<void> {
        const documentUrl = this.requireDocumentUrl();

        await this.requireEngine().update(
            requireUrlParentDirectory(documentUrl),
            documentUrl,
            graphUpdates.length === 1
                ? { '@graph': graphUpdates[0] as EngineAttributeUpdateOperation }
                : { '@graph': { $apply: graphUpdates } },
        );
    }

}

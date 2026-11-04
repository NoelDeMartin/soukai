import { requireSolidEngine } from 'soukai-bis/engines/utils';
import type ACPAccessControl from 'soukai-bis/models/acp/ACPAccessControl';
import type ACPAccessControlResource from 'soukai-bis/models/acp/ACPAccessControlResource';
import type { ParsedACR } from 'soukai-bis/models/acp/internals';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

async function loadAccessControlsAs(
    accessControlResources: ACPAccessControlResource[],
    acr: ParsedACR,
    AccessControlClass: ModelConstructor<ACPAccessControl>,
): Promise<void> {
    const modelsCache = new Map();
    const loadAs = async (accessControls: ACPAccessControl[] = []) =>
        Promise.all(
            accessControls.map(
                async (accessControl) =>
                    (accessControl.url &&
                        (await AccessControlClass.createFromRDF(acr.modelQuads, {
                            url: accessControl.url,
                            modelsCache,
                        }))) ||
                    accessControl,
            ),
        );

    for (const accessControlResource of accessControlResources) {
        if (accessControlResource.isRelationLoaded('accessControls')) {
            await accessControlResource.setRelationModels(
                'accessControls',
                await loadAs(accessControlResource.accessControls),
            );
        }

        if (accessControlResource.isRelationLoaded('memberAccessControls')) {
            await accessControlResource.setRelationModels(
                'memberAccessControls',
                await loadAs(accessControlResource.memberAccessControls),
            );
        }
    }
}

function getAccessControlResourceClass(model: Model): typeof ACPAccessControlResource {
    const engine = requireSolidEngine(
        model.static().requireEngine(),
        `manage permissions for ${model.static('modelName')} models`,
    );
    const AccessControlResource = class extends requireBootedModel('ACPAccessControlResource') {};

    AccessControlResource.setEngine(engine);

    return AccessControlResource;
}

export interface ACPPermissionsOptions {
    accessControlClass?: ModelConstructor<ACPAccessControl>;
}

export async function readACPAccessControlResources(
    model: Model,
    acr: ParsedACR,
    options: ACPPermissionsOptions = {},
): Promise<ModelWithUrl<ACPAccessControlResource>[]> {
    const AccessControlResource = getAccessControlResourceClass(model);
    const accessControlResources = await AccessControlResource.createManyFromRDF(acr.modelQuads);

    if (options.accessControlClass) {
        await loadAccessControlsAs(accessControlResources, acr, options.accessControlClass);
    }

    return accessControlResources;
}

export function newACPAccessControlResource(
    model: Model,
    acr: { url: string; exists: boolean },
): ModelWithUrl<ACPAccessControlResource> {
    const AccessControlResource = getAccessControlResourceClass(model);
    const accessControlResource = new AccessControlResource({ resourceUrls: [model.requireDocumentUrl()] });

    accessControlResource.mintUrl({ documentUrl: acr.url, documentExists: acr.exists, resourceHash: 'it' });

    return accessControlResource as ModelWithUrl<ACPAccessControlResource>;
}

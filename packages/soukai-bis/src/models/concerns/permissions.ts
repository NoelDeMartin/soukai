import { SolidDocument, expandIRI, fetchSolidDocumentACL } from '@noeldemartin/solid-utils';
import type { SolidDocumentPermission } from '@noeldemartin/solid-utils';
import { arrayUnique, urlParse, uuid } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireSolidEngine } from 'soukai-bis/engines/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type ACLAuthorization from 'soukai-bis/models/acl/ACLAuthorization';
import type Model from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelWithUrl } from 'soukai-bis/models/types';

import { serializeToRDF } from './rdf';

const PUBLIC_AGENT_CLASS = expandIRI('foaf:Agent');
const CONTROL_MODE = expandIRI('acl:Control');

function requireModelSolidEngine(model: Model): SolidEngine {
    return requireSolidEngine(
        model.static().requireEngine(),
        `manage permissions for ${model.static('modelName')} models`,
    );
}

function getAuthorizationClass(engine: SolidEngine): typeof ACLAuthorization {
    const AuthorizationClass = class extends requireBootedModel('ACLAuthorization') {};

    AuthorizationClass.setEngine(engine);

    return AuthorizationClass;
}

function sameModes(modes: string[], otherModes: string[]): boolean {
    return modes.length === otherModes.length && modes.every((mode) => otherModes.includes(mode));
}

function getChildrenDefault(documentUrl: string): string[] {
    return documentUrl.endsWith('/') ? [documentUrl] : [];
}

function isPublic(authorization: ACLAuthorization): boolean {
    return authorization.agentClasses.includes(PUBLIC_AGENT_CLASS) && authorization.origins.length === 0;
}

function isPublicOnly(authorization: ACLAuthorization, documentUrl: string): boolean {
    return (
        authorization.agents.length === 0 &&
        authorization.agentGroups.length === 0 &&
        authorization.agentClasses.length === 1 &&
        authorization.accessTo.length === 1 &&
        authorization.accessTo[0] === documentUrl &&
        authorization.accessToClasses.length === 0 &&
        authorization.default.every((url) => url === documentUrl)
    );
}

function mintAuthorizationUrl(
    authorization: ACLAuthorization,
    acl: { url: string; exists: boolean },
    takenUrls: Set<string>,
    fragment: string,
): void {
    const resourceHash = takenUrls.has(`${acl.url}#${fragment}`) ? `${fragment}-${uuid()}` : fragment;

    authorization.mintUrl({ documentUrl: acl.url, documentExists: acl.exists, resourceHash });
    takenUrls.add(authorization.requireUrl());
}

async function updateDocumentACL(
    AuthorizationClass: typeof ACLAuthorization,
    authorizations: ModelWithUrl<ACLAuthorization>[],
    acl: { url: string; documentUrl: string },
    modes: string[],
): Promise<void> {
    const childrenDefault = getChildrenDefault(acl.documentUrl);
    const publicAuthorizations = authorizations.filter(
        (authorization) => isPublic(authorization) && authorization.accessTo.includes(acl.documentUrl),
    );

    if (
        sameModes(arrayUnique(publicAuthorizations.flatMap((authorization) => authorization.modes)), modes) &&
        publicAuthorizations.every((authorization) =>
            childrenDefault.every((url) => authorization.default.includes(url)),
        )
    ) {
        return;
    }

    const exclusiveAuthorizations = publicAuthorizations.filter((authorization) =>
        isPublicOnly(authorization, acl.documentUrl),
    );
    const sharedModes = arrayUnique(
        publicAuthorizations
            .filter((authorization) => !exclusiveAuthorizations.includes(authorization))
            .flatMap((authorization) => authorization.modes),
    );

    if (sharedModes.some((mode) => !modes.includes(mode))) {
        throw new SoukaiError(
            `Can't update public permissions for ${acl.documentUrl}, ` +
                'they are granted by authorizations that also apply to other agents or resources',
        );
    }

    if (modes.length === 0) {
        for (const authorization of exclusiveAuthorizations) {
            await authorization.delete();
        }

        return;
    }

    if (exclusiveAuthorizations.length > 0) {
        for (const authorization of exclusiveAuthorizations) {
            await authorization.update({ modes, default: childrenDefault });
        }

        return;
    }

    const authorization = new AuthorizationClass({
        agentClasses: [PUBLIC_AGENT_CLASS],
        accessTo: [acl.documentUrl],
        default: childrenDefault,
        modes,
    });

    mintAuthorizationUrl(
        authorization,
        { url: acl.url, exists: true },
        new Set(authorizations.map(({ url }) => url)),
        'public',
    );

    await authorization.save();
}

async function createDocumentACL(
    engine: SolidEngine,
    AuthorizationClass: typeof ACLAuthorization,
    inheritedAuthorizations: ModelWithUrl<ACLAuthorization>[],
    acl: { url: string; documentUrl: string },
    modes: string[],
): Promise<void> {
    const applicableAuthorizations = inheritedAuthorizations.filter(
        (authorization) => authorization.default.length > 0,
    );
    const inheritedPublicModes = arrayUnique(
        applicableAuthorizations
            .filter((authorization) => isPublic(authorization))
            .flatMap((authorization) => authorization.modes),
    );

    if (sameModes(inheritedPublicModes, modes)) {
        return;
    }

    const takenUrls = new Set<string>();
    const authorizations = applicableAuthorizations
        .map((inheritedAuthorization) => {
            const agentClasses = isPublic(inheritedAuthorization)
                ? inheritedAuthorization.agentClasses.filter((agentClass) => agentClass !== PUBLIC_AGENT_CLASS)
                : inheritedAuthorization.agentClasses;

            if (
                agentClasses.length === 0 &&
                inheritedAuthorization.agents.length === 0 &&
                inheritedAuthorization.agentGroups.length === 0
            ) {
                return null;
            }

            const authorization = new AuthorizationClass({
                agents: inheritedAuthorization.agents,
                agentClasses,
                agentGroups: inheritedAuthorization.agentGroups,
                origins: inheritedAuthorization.origins,
                accessTo: [acl.documentUrl],
                default: getChildrenDefault(acl.documentUrl),
                modes: inheritedAuthorization.modes,
            });

            mintAuthorizationUrl(
                authorization,
                { url: acl.url, exists: false },
                takenUrls,
                urlParse(inheritedAuthorization.url)?.fragment ?? uuid(),
            );

            return authorization;
        })
        .filter((authorization) => authorization !== null);

    if (!authorizations.some((authorization) => authorization.modes.includes(CONTROL_MODE))) {
        throw new SoukaiError(
            `Can't create ACL for ${acl.documentUrl}, none of the inherited authorizations grants control access`,
        );
    }

    if (modes.length > 0) {
        const publicAuthorization = new AuthorizationClass({
            agentClasses: [PUBLIC_AGENT_CLASS],
            accessTo: [acl.documentUrl],
            default: getChildrenDefault(acl.documentUrl),
            modes,
        });

        mintAuthorizationUrl(publicAuthorization, { url: acl.url, exists: false }, takenUrls, 'public');
        authorizations.push(publicAuthorization);
    }

    await engine.createDocument(acl.url, serializeToRDF(authorizations));
}

export async function fetchPublicPermissions(model: Model): Promise<SolidDocumentPermission[]> {
    requireModelSolidEngine(model);

    const documentUrl = model.requireDocumentUrl();
    const response = await model.static().requireFetch()(documentUrl, { method: 'HEAD' });

    return new SolidDocument(documentUrl, [], response.headers).getPublicPermissions();
}

export async function updatePublicPermissions(model: Model, permissions: SolidDocumentPermission[]): Promise<void> {
    const engine = requireModelSolidEngine(model);
    const documentUrl = model.requireDocumentUrl();
    const acl = await fetchSolidDocumentACL(documentUrl, model.static().requireFetch());
    const AuthorizationClass = getAuthorizationClass(engine);
    const authorizations = await AuthorizationClass.createManyFromRDF(acl.document.getQuads());
    const modes = arrayUnique(permissions.map((permission) => AuthorizationClass.modeFromPermission(permission)));

    if (acl.url === acl.effectiveUrl) {
        await updateDocumentACL(AuthorizationClass, authorizations, { url: acl.url, documentUrl }, modes);

        return;
    }

    await createDocumentACL(engine, AuthorizationClass, authorizations, { url: acl.url, documentUrl }, modes);
}

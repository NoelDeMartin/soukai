import {
    SolidDocumentPermissions,
    UnsupportedAuthorizationProtocol,
    expandIRI,
    fetchSolidDocumentACL,
} from '@noeldemartin/solid-utils';
import type { SolidDocumentPermission } from '@noeldemartin/solid-utils';
import { arrayUnique, urlParse, uuid } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireRemoteEngine } from 'soukai-bis/engines/state';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type ACLAuthorization from 'soukai-bis/models/acl/ACLAuthorization';
import { serializeToRDF } from 'soukai-bis/models/internals/rdf';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { AuthorizationProtocol, ModelWithUrl, WACAuthorizationInput } from 'soukai-bis/models/types';

const authorizationProtocols = new Map<string, AuthorizationProtocol>();
const PUBLIC_AGENT_CLASS = expandIRI('foaf:Agent');
const CONTROL_MODE = expandIRI('acl:Control');
const PERMISSION_MODES: Record<SolidDocumentPermission, string> = {
    [SolidDocumentPermissions.Read]: expandIRI('acl:Read'),
    [SolidDocumentPermissions.Write]: expandIRI('acl:Write'),
    [SolidDocumentPermissions.Append]: expandIRI('acl:Append'),
    [SolidDocumentPermissions.Control]: CONTROL_MODE,
};

function getOrigin(url: string): string {
    return new URL(url).origin;
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

function assertControlAccessIsKept(authorizations: ACLAuthorization[], documentUrl: string): void {
    if (authorizations.some((authorization) => authorization.modes.includes(CONTROL_MODE))) {
        return;
    }

    throw new SoukaiError(`Can't create ACL for ${documentUrl}, none of the authorizations grants control access`);
}

function modeFromPermission(permission: SolidDocumentPermission): string {
    return PERMISSION_MODES[permission];
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

function copyInheritedAuthorizations(
    AuthorizationClass: typeof ACLAuthorization,
    inheritedAuthorizations: ModelWithUrl<ACLAuthorization>[],
    acl: { url: string; documentUrl: string },
    takenUrls: Set<string>,
    options: { excludePublic?: boolean } = {},
): ACLAuthorization[] {
    return inheritedAuthorizations
        .filter((authorization) => authorization.default.length > 0)
        .map((inheritedAuthorization) => {
            const agentClasses =
                options.excludePublic && isPublic(inheritedAuthorization)
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
}

async function createPublicDocumentACL(
    engine: SolidEngine,
    AuthorizationClass: typeof ACLAuthorization,
    inheritedAuthorizations: ModelWithUrl<ACLAuthorization>[],
    acl: { url: string; documentUrl: string },
    modes: string[],
): Promise<void> {
    const inheritedPublicModes = arrayUnique(
        inheritedAuthorizations
            .filter((authorization) => authorization.default.length > 0 && isPublic(authorization))
            .flatMap((authorization) => authorization.modes),
    );

    if (sameModes(inheritedPublicModes, modes)) {
        return;
    }

    const takenUrls = new Set<string>();
    const authorizations = copyInheritedAuthorizations(AuthorizationClass, inheritedAuthorizations, acl, takenUrls, {
        excludePublic: true,
    });

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

    assertControlAccessIsKept(authorizations, acl.documentUrl);

    await engine.createDocument(acl.url, serializeToRDF(authorizations));
}

async function updateWACPublicPermissions(documentUrl: string, permissions: SolidDocumentPermission[]): Promise<void> {
    const AuthorizationClass = requireBootedModel('ACLAuthorization');
    const engine = requireRemoteEngine();
    const acl = await fetchSolidDocumentACL(documentUrl, { fetch: engine.requireFetch() });
    const authorizations = await AuthorizationClass.fromRDF(acl.document.getQuads()).all();
    const modes = arrayUnique(permissions.map((permission) => modeFromPermission(permission)));

    if (acl.url === acl.effectiveUrl) {
        await updateDocumentACL(AuthorizationClass, authorizations, { url: acl.url, documentUrl }, modes);

        return;
    }

    await createPublicDocumentACL(engine, AuthorizationClass, authorizations, { url: acl.url, documentUrl }, modes);
}

async function createWACDocumentAuthorization(documentUrl: string, input: WACAuthorizationInput): Promise<string> {
    const AuthorizationClass = requireBootedModel('ACLAuthorization');
    const engine = requireRemoteEngine();
    const acl = await fetchSolidDocumentACL(documentUrl, { fetch: engine.requireFetch() });
    const existingAuthorizations = await AuthorizationClass.fromRDF(acl.document.getQuads()).all();
    const authorization = new AuthorizationClass({
        ...input,
        accessTo: [documentUrl],
        default: getChildrenDefault(documentUrl),
    });

    if (acl.url === acl.effectiveUrl) {
        const takenUrls = new Set(existingAuthorizations.map(({ url }) => url));

        mintAuthorizationUrl(authorization, { url: acl.url, exists: true }, takenUrls, uuid());

        await authorization.save();

        return authorization.requireUrl();
    }

    const takenUrls = new Set<string>();
    const inheritedAuthorizations = copyInheritedAuthorizations(
        AuthorizationClass,
        existingAuthorizations,
        { url: acl.url, documentUrl },
        takenUrls,
    );

    mintAuthorizationUrl(authorization, { url: acl.url, exists: false }, takenUrls, uuid());

    await engine.createDocument(acl.url, serializeToRDF([...inheritedAuthorizations, authorization]));

    return authorization.requireUrl();
}

export function getAuthorizationProtocol(url: string): AuthorizationProtocol | undefined {
    return authorizationProtocols.get(getOrigin(url));
}

export function rememberAuthorizationProtocol(url: string, protocol: AuthorizationProtocol): void {
    authorizationProtocols.set(getOrigin(url), protocol);
}

export function forgetAuthorizationProtocols(): void {
    authorizationProtocols.clear();
}

export async function trackAuthorizationProtocol<T>(
    url: string,
    protocol: AuthorizationProtocol,
    operation: () => Promise<T>,
): Promise<T> {
    try {
        const result = await operation();

        rememberAuthorizationProtocol(url, protocol);

        return result;
    } catch (error) {
        const detectedProtocol = error instanceof UnsupportedAuthorizationProtocol && error.protocol.toLowerCase();

        if (detectedProtocol === 'wac' || detectedProtocol === 'acp') {
            rememberAuthorizationProtocol(url, detectedProtocol);
        }

        throw error;
    }
}

export async function updatePublicPermissions(
    documentUrl: string,
    permissions: SolidDocumentPermission[],
): Promise<void> {
    await trackAuthorizationProtocol(documentUrl, 'wac', () => updateWACPublicPermissions(documentUrl, permissions));
}

export async function createWACAuthorization(documentUrl: string, input: WACAuthorizationInput): Promise<string> {
    const hasAgents = [input.agents, input.agentClasses, input.agentGroups].some((values) => !!values?.length);

    if (!hasAgents || !input.modes?.length) {
        throw new SoukaiError(
            `Can't create WAC authorization for ${documentUrl}, it must include at least one agent and one mode`,
        );
    }

    return trackAuthorizationProtocol(documentUrl, 'wac', () => createWACDocumentAuthorization(documentUrl, input));
}

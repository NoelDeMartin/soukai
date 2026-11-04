import {
    NotFound,
    SolidDocument,
    Unauthorized,
    UnsuccessfulNetworkRequest,
    UnsupportedAuthorizationProtocol,
    fetchSolidDocumentIfFound,
    getLinkHeaderUrl,
} from '@noeldemartin/solid-utils';
import type { Fetch, SolidDocumentPermission } from '@noeldemartin/solid-utils';
import { requireUrlParentDirectory } from '@noeldemartin/utils';
import { requireSolidEngine } from 'soukai-bis/engines';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import type ACPAccessControlResource from 'soukai-bis/models/acp/ACPAccessControlResource';
import { parseACR } from 'soukai-bis/models/acp/internals';
import type Model from 'soukai-bis/models/Model';
import type { ModelWithUrl } from 'soukai-bis/models/types';

import { readACPAccessControlResources } from './acp';
import type { ACPPermissionsOptions } from './acp';

interface AuthorizationDocument {
    url: string;
    document: SolidDocument | null;
}

const authorizationProtocols = new Map<string, AuthorizationProtocol>();

function requireModelFetch(model: Model): Fetch {
    requireSolidEngine(model.static().requireEngine(), `manage permissions for ${model.static('modelName')} models`);

    return model.static().requireFetch();
}

function getOrigin(url: string): string {
    return new URL(url).origin;
}

function getParentContainerUrl(url: string): string | null {
    const rootContainerUrl = `${getOrigin(url)}/`;

    return url === rootContainerUrl ? null : requireUrlParentDirectory(url);
}

function getDocumentProtocol(document: SolidDocument): AuthorizationProtocol {
    return document.isACPResource() ? 'acp' : 'wac';
}

async function fetchResourceHead(url: string, fetch: Fetch): Promise<Response> {
    const response = await fetch(url, { method: 'HEAD' });

    if (response.status === 401 || response.status === 403) {
        throw new Unauthorized(url, response.status);
    }

    if (response.status === 404) {
        throw new NotFound(url);
    }

    if (response.status < 200 || response.status >= 300) {
        throw new UnsuccessfulNetworkRequest(`Couldn't read the permissions of ${url}`, response);
    }

    return response;
}

async function fetchAuthorizationDocument(
    resourceUrl: string,
    resourceHead: Response,
    fetch: Fetch,
): Promise<AuthorizationDocument> {
    const url = getLinkHeaderUrl(resourceHead.headers, 'acl', { baseUrl: resourceUrl });

    if (!url) {
        throw new SoukaiError(`Couldn't find the access control document of ${resourceUrl}`);
    }

    const document = await fetchSolidDocumentIfFound(url, { fetch });

    return { url, document };
}

async function detectAuthorizationProtocol(
    documentUrl: string,
    authorizationDocument: AuthorizationDocument,
    fetch: Fetch,
): Promise<AuthorizationProtocol> {
    if (authorizationDocument.document) {
        return getDocumentProtocol(authorizationDocument.document);
    }

    for (
        let containerUrl = getParentContainerUrl(documentUrl);
        containerUrl;
        containerUrl = getParentContainerUrl(containerUrl)
    ) {
        const containerHead = await fetchResourceHead(containerUrl, fetch);
        const containerAuthorizationDocument = await fetchAuthorizationDocument(containerUrl, containerHead, fetch);

        if (containerAuthorizationDocument.document) {
            return getDocumentProtocol(containerAuthorizationDocument.document);
        }
    }

    throw new SoukaiError(`Couldn't find any access control documents for ${documentUrl}`);
}

export type AuthorizationProtocol = 'wac' | 'acp';

export type FetchPermissionsOptions = ACPPermissionsOptions;

export type ModelPermissions =
    | {
          protocol: 'wac';
          publicPermissions: SolidDocumentPermission[] | null;
      }
    | {
          protocol: 'acp';
          publicPermissions: SolidDocumentPermission[] | null;
          accessControlResources: ModelWithUrl<ACPAccessControlResource>[];
          acr: { url: string; exists: boolean };
      }
    | {
          protocol: 'unknown';
          publicPermissions: SolidDocumentPermission[];
      };

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

export async function fetchPermissions(model: Model, options: FetchPermissionsOptions = {}): Promise<ModelPermissions> {
    const fetch = requireModelFetch(model);
    const documentUrl = model.requireDocumentUrl();
    const documentHead = await fetchResourceHead(documentUrl, fetch);
    const publicPermissions = documentHead.headers.has('WAC-Allow')
        ? new SolidDocument(documentUrl, [], documentHead.headers).getPublicPermissions()
        : null;

    if (authorizationProtocols.get(getOrigin(documentUrl)) === 'wac' && publicPermissions) {
        return { protocol: 'wac', publicPermissions };
    }

    try {
        const authorizationDocument = await fetchAuthorizationDocument(documentUrl, documentHead, fetch);
        const protocol = await detectAuthorizationProtocol(documentUrl, authorizationDocument, fetch);

        rememberAuthorizationProtocol(documentUrl, protocol);

        if (protocol === 'wac') {
            return { protocol, publicPermissions };
        }

        const acr = parseACR(authorizationDocument.url, authorizationDocument.document);
        const accessControlResources = await readACPAccessControlResources(model, acr, options);

        return { protocol, publicPermissions, accessControlResources, acr: { url: acr.url, exists: acr.exists } };
    } catch (error) {
        if (error instanceof Unauthorized && publicPermissions) {
            return { protocol: 'unknown', publicPermissions };
        }

        throw error;
    }
}

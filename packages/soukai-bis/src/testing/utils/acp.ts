import { FakeResponse, FakeServer } from '@noeldemartin/testing';

export const ACP_PREFIXES = `
    @prefix acl: <http://www.w3.org/ns/auth/acl#>.
    @prefix acp: <http://www.w3.org/ns/solid/acp#>.
    @prefix dct: <http://purl.org/dc/terms/>.
    @prefix ex: <https://example.org/vocab#>.
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
`;

export const ACR_TYPE_HEADERS = { Link: '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"' };

export function acrResponse(turtle: string | null): Response {
    return turtle === null
        ? FakeResponse.notFound()
        : FakeResponse.success(`${ACP_PREFIXES}\n${turtle}`, ACR_TYPE_HEADERS);
}

export function respondWithACR(acrUrl: string, turtle: string | null): void {
    FakeServer.respond(acrUrl, acrResponse(turtle));
}

export function respondWithACLLink(url: string, aclLink: string, headers: Record<string, string> = {}): void {
    FakeServer.respond(url, FakeResponse.success(undefined, { Link: `<${aclLink}>; rel="acl"`, ...headers }));
}

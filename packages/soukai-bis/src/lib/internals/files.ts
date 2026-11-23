import { isInstanceOf, shortId, uuid } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type Engine from 'soukai-bis/engines/Engine';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import { requireEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl } from 'soukai-bis/lib/internals/urls';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';

import { RDF_TYPE_PREDICATE } from './rdf';

function getFileName(blob: Blob): string | undefined {
    return typeof File !== 'undefined' && blob instanceof File && blob.name ? blob.name : undefined;
}

function getFileUrl(urlOrContainerUrl: string, blob: Blob, options: UploadFileOptions): string {
    if (!urlOrContainerUrl.endsWith('/')) {
        return urlOrContainerUrl;
    }

    const slug = options.slug ?? getFileName(blob) ?? uuid();

    return `${urlOrContainerUrl}${encodeURIComponent(slug)}`;
}

function uniqueFileUrl(url: string): string {
    const containerUrl = requireSafeContainerUrl(url);
    const name = url.slice(containerUrl.length);
    const extensionIndex = name.lastIndexOf('.');
    const id = shortId();

    return extensionIndex > 0
        ? `${containerUrl}${name.slice(0, extensionIndex)}-${id}${name.slice(extensionIndex)}`
        : `${containerUrl}${name}-${id}`;
}

async function writeFile(url: string, blob: Blob, options: UploadFileOptions & FileEngineOptions): Promise<void> {
    const engine = options.engine ?? requireEngine();

    if (!isLocalEngine(engine)) {
        options.overwrite
            ? await engine.writeFile(url, blob, { mimeType: options.mimeType })
            : await engine.createFile(url, blob, { mimeType: options.mimeType });

        return;
    }

    await writeLocalFile(engine, url, blob, options);
}

async function writeLocalFile(engine: LocalEngine, url: string, blob: Blob, options: UploadFileOptions): Promise<void> {
    const existingFile = await engine.getLocalFile(url);
    const exists = !!existingFile && !existingFile.deleted;
    const localChanges = options.trackLocalChanges ? fileLocalChanges(url, exists ? 'updated' : 'created') : undefined;

    options.overwrite
        ? await engine.writeFile(url, blob, { mimeType: options.mimeType, localChanges })
        : await engine.createFile(url, blob, { mimeType: options.mimeType, localChanges });
}

export const IANA_MEDIA_TYPE_PREFIX = 'http://www.w3.org/ns/iana/media-types/';
export const RDF_MEDIA_TYPES = new Set([
    'text/turtle',
    'application/ld+json',
    'application/n-triples',
    'application/n-quads',
    'text/n3',
    'application/rdf+xml',
    'application/trig',
]);

export interface UploadFileOptions {
    slug?: string;
    mimeType?: string;
    overwrite?: boolean;
    trackLocalChanges?: boolean;
}

export interface DeleteFileOptions {
    trackLocalChanges?: boolean;
}

export interface FileEngineOptions {
    engine?: Engine;
}

export function mediaTypeFromRDFType(rdfType: string): string | null {
    if (!rdfType.startsWith(IANA_MEDIA_TYPE_PREFIX)) {
        return null;
    }

    return rdfType.slice(IANA_MEDIA_TYPE_PREFIX.length).replace(/#Resource$/, '');
}

export function mediaTypeToRDFType(mediaType: string): string {
    return `${IANA_MEDIA_TYPE_PREFIX}${mediaType}#Resource`;
}

export function isRDFMediaType(mediaType: string): boolean {
    return RDF_MEDIA_TYPES.has((mediaType.split(';')[0] ?? mediaType).trim().toLowerCase());
}

export function getResourceMediaTypes(quads: Quad[], resourceUrl: string): string[] {
    return quads
        .filter(
            (quad) =>
                quad.subject.value === resourceUrl &&
                quad.predicate.equals(RDF_TYPE_PREDICATE) &&
                quad.object.value.startsWith(IANA_MEDIA_TYPE_PREFIX),
        )
        .map((quad) => mediaTypeFromRDFType(quad.object.value))
        .filter((mediaType): mediaType is string => !!mediaType);
}

export function isNonRDFMediaTypes(mediaTypes: string[]): boolean {
    return mediaTypes.length > 0 && !mediaTypes.some((mediaType) => isRDFMediaType(mediaType));
}

export function isNonRDFResource(quads: Quad[], resourceUrl: string): boolean {
    if (resourceUrl.endsWith('/')) {
        return false;
    }

    return isNonRDFMediaTypes(getResourceMediaTypes(quads, resourceUrl));
}

export async function uploadFile(
    urlOrContainerUrl: string,
    blob: Blob,
    options: UploadFileOptions & FileEngineOptions = {},
): Promise<string> {
    let url = getFileUrl(urlOrContainerUrl, blob, options);

    if (url.endsWith('/')) {
        throw new SoukaiError(`Can't upload a file to ${url}, it is a container`);
    }

    try {
        await writeFile(url, blob, options);
    } catch (error) {
        if (!isInstanceOf(error, FileAlreadyExists)) {
            throw error;
        }

        url = uniqueFileUrl(url);

        await writeFile(url, blob, options);
    }

    await ComputedAttributesCache.invalidate({ documentUrls: [url] });

    return url;
}

export async function deleteFile(url: string, options: DeleteFileOptions & FileEngineOptions = {}): Promise<void> {
    const engine = options.engine ?? requireEngine();

    isLocalEngine(engine)
        ? await engine.deleteFile(url, {
              localChanges: options.trackLocalChanges ? fileLocalChanges(url, 'deleted') : undefined,
          })
        : await engine.deleteFile(url);

    await ComputedAttributesCache.invalidate({ documentUrls: [url] });
}

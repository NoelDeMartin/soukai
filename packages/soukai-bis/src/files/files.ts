import { isInstanceOf, shortId, uuid } from '@noeldemartin/utils';
import { fileLocalChanges } from 'soukai-bis/engines/local-changes';
import type LocalEngine from 'soukai-bis/engines/LocalEngine';
import { requireEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import FileAlreadyExists from 'soukai-bis/errors/FileAlreadyExists';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { requireSafeContainerUrl } from 'soukai-bis/lib/internals/urls';
import ComputedAttributesCache from 'soukai-bis/models/computed-attributes/ComputedAttributesCache';

export interface UploadFileOptions {
    slug?: string;
    mimeType?: string;
    overwrite?: boolean;
}

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

async function writeFile(url: string, blob: Blob, options: UploadFileOptions): Promise<void> {
    const engine = requireEngine();

    if (!isLocalEngine(engine)) {
        options.overwrite
            ? await engine.writeFile(url, blob, { mimeType: options.mimeType })
            : await engine.createFile(url, blob, { mimeType: options.mimeType });

        return;
    }

    await writeLocalFile(engine, url, blob, options);
}

async function writeLocalFile(engine: LocalEngine, url: string, blob: Blob, options: UploadFileOptions): Promise<void> {
    const existingFile = await engine.getFile(url);
    const exists = !!existingFile && !existingFile.deleted;
    const localChanges = fileLocalChanges(url, exists ? 'updated' : 'created');

    options.overwrite
        ? await engine.writeFile(url, blob, { mimeType: options.mimeType, localChanges })
        : await engine.createFile(url, blob, { mimeType: options.mimeType, localChanges });
}

export function uniqueFileUrl(url: string): string {
    const containerUrl = requireSafeContainerUrl(url);
    const name = url.slice(containerUrl.length);
    const extensionIndex = name.lastIndexOf('.');
    const id = shortId();

    return extensionIndex > 0
        ? `${containerUrl}${name.slice(0, extensionIndex)}-${id}${name.slice(extensionIndex)}`
        : `${containerUrl}${name}-${id}`;
}

export async function uploadFile(
    urlOrContainerUrl: string,
    blob: Blob,
    options: UploadFileOptions = {},
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

export function readFile(url: string): Promise<Blob> {
    return requireEngine().readFile(url);
}

export function readFileIfExists(url: string): Promise<Blob | null> {
    return requireEngine().readFileIfExists(url);
}

export async function deleteFile(url: string): Promise<void> {
    const engine = requireEngine();

    isLocalEngine(engine)
        ? await engine.deleteFile(url, { localChanges: fileLocalChanges(url, 'deleted') })
        : await engine.deleteFile(url);

    await ComputedAttributesCache.invalidate({ documentUrls: [url] });
}

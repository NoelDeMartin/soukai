import type Engine from 'soukai-bis/engines/Engine';
import { getRemoteEngine, requireEngine } from 'soukai-bis/engines/state';
import { isLocalEngine } from 'soukai-bis/engines/utils';
import DocumentNotFound from 'soukai-bis/errors/DocumentNotFound';

import { isLocalUrl } from './urls';

export type { UploadFileOptions } from './internals/files';

export interface ReadFileOptions {
    engine?: Engine;
}

export async function readFileIfExists(url: string, options: ReadFileOptions = {}): Promise<Blob | null> {
    const engine = options.engine ?? requireEngine();

    if (!isLocalEngine(engine)) {
        return engine.readFileIfExists(url);
    }

    const file = await engine.getFile(url);

    if (file?.deleted) {
        return null;
    }

    if (file?.blob) {
        return file.blob;
    }

    const remoteEngine = getRemoteEngine();

    if (!remoteEngine || isLocalUrl(url)) {
        return null;
    }

    return remoteEngine.readFileIfExists(url);
}

export async function readFile(url: string, options: ReadFileOptions = {}): Promise<Blob> {
    const blob = await readFileIfExists(url, options);

    if (!blob) {
        throw new DocumentNotFound(url);
    }

    return blob;
}

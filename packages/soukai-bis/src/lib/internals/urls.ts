import { fail } from '@noeldemartin/utils';
import { SoukaiError } from 'soukai-bis/errors';

export function safeContainerUrl(url: string): string | null {
    if (/^\w+:\/\/$/.test(url)) {
        return null;
    }

    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const pathIndex = cleanUrl.lastIndexOf('/');
    const containerUrl = cleanUrl.slice(0, pathIndex + 1);

    return containerUrl;
}

export function requireSafeContainerUrl(url: string): string {
    return safeContainerUrl(url) ?? fail(SoukaiError, `Failed getting container from url: ${url}`);
}

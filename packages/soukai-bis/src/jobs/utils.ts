import { urlRoute } from '@noeldemartin/utils';
import type { ModelConstructor } from 'soukai-bis/models';

import type Job from './Job';

export type ExternalSource =
    | { containerUrl: string; instanceUrl?: undefined; models: ModelConstructor[] }
    | { instanceUrl: string; containerUrl?: undefined; models: ModelConstructor[] };

export function getExternalSourceUrl(source: ExternalSource): string {
    return source.containerUrl !== undefined ? source.containerUrl : urlRoute(source.instanceUrl);
}

export function isInExternalSource(source: ExternalSource, url: string): boolean {
    return source.containerUrl !== undefined
        ? url.startsWith(source.containerUrl)
        : urlRoute(url) === urlRoute(source.instanceUrl);
}

export async function dispatch(job: Job): Promise<void> {
    await job.process();
}

import type { JsonLD } from '@noeldemartin/solid-utils';

import type Operation from 'soukai-bis/models/crdts/Operation';

export default interface Engine {
    createDocument(url: string, graph: JsonLD): Promise<void>;
    updateDocument(url: string, operations: Operation[]): Promise<void>;
    readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>>;
}

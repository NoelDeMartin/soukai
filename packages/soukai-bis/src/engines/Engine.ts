import type { JsonLD } from '@noeldemartin/solid-utils';

export interface Engine {
    createDocument(url: string, graph: JsonLD): Promise<void>;
    updateDocument(url: string, graph: JsonLD): Promise<void>;
    readManyDocuments(containerUrl: string): Promise<Record<string, JsonLD>>;
}

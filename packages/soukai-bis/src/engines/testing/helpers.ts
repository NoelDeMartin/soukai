import { jsonldToQuads } from '@noeldemartin/solid-utils';
import { serializeIDBQuads } from 'soukai-bis/lib/internals/idb-quads';
import SoukaiIndexedDB from 'soukai-bis/lib/internals/SoukaiIndexedDB';
import type { LocalDocument } from 'soukai-bis/lib/internals/SoukaiIndexedDB';

export async function getDatabaseDocuments(containerUrl: string): Promise<LocalDocument[]> {
    const db = await SoukaiIndexedDB.connect();

    return db.getAllFromIndex('documents', 'containerUrl', containerUrl);
}

export async function setDatabaseDocument(
    containerUrl: string,
    url: string,
    graph: Record<string, unknown>,
    metadata?: { lastModifiedAt?: Date },
): Promise<void> {
    const resources = serializeIDBQuads(await jsonldToQuads(graph));
    const db = await SoukaiIndexedDB.connect();
    const transaction = db.transaction(['containers', 'documents'], 'readwrite');
    const container = await transaction.objectStore('containers').get(containerUrl);

    if (!container) {
        await transaction.objectStore('containers').add({ url: containerUrl });
    }

    await transaction.objectStore('documents').put({
        url,
        containerUrl,
        resources,
        lastModifiedAt: metadata?.lastModifiedAt,
    });

    await transaction.done;
}

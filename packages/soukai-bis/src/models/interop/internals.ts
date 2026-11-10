import type { CompleteSolidUserProfile, Fetch } from '@noeldemartin/solid-utils';
import { createSolidDocument, mintSettingsDocumentUrl } from '@noeldemartin/solid-utils';
import { requireBootedModel } from 'soukai-bis/models/registry';

import type TypeIndex from './TypeIndex';
import type { TypeIndexRegistration } from './TypeIndex';

export async function createTypeIndexDocument(
    user: CompleteSolidUserProfile,
    visibility: TypeIndexRegistration,
    fetch: Fetch,
): Promise<string> {
    const url = await mintSettingsDocumentUrl(user, `${visibility}TypeIndex`, { fetch });
    const documentClass = visibility === 'public' ? 'ListedDocument' : 'UnlistedDocument';

    await createSolidDocument(
        url,
        `
            <> a
                <http://www.w3.org/ns/solid/terms#TypeIndex>,
                <http://www.w3.org/ns/solid/terms#${documentClass}> .
        `,
        { fetch },
    );

    return url;
}

export async function resolveTypeIndex(typeIndex: string | TypeIndex): Promise<TypeIndex> {
    if (typeof typeIndex !== 'string') {
        return typeIndex;
    }

    return requireBootedModel('TypeIndex').findOrFail(typeIndex);
}

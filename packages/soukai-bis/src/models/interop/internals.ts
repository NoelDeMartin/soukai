import type { CompleteSolidUserProfile, Fetch } from '@noeldemartin/solid-utils';
import { createSolidDocument, mintSettingsDocumentUrl } from '@noeldemartin/solid-utils';

export async function createTypeIndexDocument(
    user: CompleteSolidUserProfile,
    visibility: 'public' | 'private',
    fetch: Fetch,
): Promise<string> {
    const url = await mintSettingsDocumentUrl(user, `${visibility}TypeIndex`, fetch);
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

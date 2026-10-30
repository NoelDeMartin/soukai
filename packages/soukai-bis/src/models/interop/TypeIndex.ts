import {
    CloakedPreferencesFile,
    SolidDocumentPermissions,
    UnsupportedAuthorizationProtocol,
    findOrCreatePreferencesFile,
    linkFromDocument,
} from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { asyncFirst, isInstanceOf } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireSolidEngine } from 'soukai-bis/engines/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Container from 'soukai-bis/models/ldp/Container';
import type { ContainerConstructor, ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import { createTypeIndexDocument } from './internals';
import Model from './TypeIndex.schema';

export default class TypeIndex extends Model {
    public static requireEngine(): SolidEngine {
        return requireSolidEngine(super.requireEngine(), `use ${this.modelName} models`);
    }

    public async findContainer<T extends Container = Container>(
        modelClass: ModelConstructor,
        containerClass?: ContainerConstructor<T>,
    ): Promise<T | null> {
        await this.loadRelationIfUnloaded('registrations');

        const containerRegistrations =
            this.registrations?.filter(
                (registration) => registration.instanceContainer && registration.registers(modelClass),
            ) ?? [];

        return asyncFirst(containerRegistrations, async (registration) =>
            registration?.instanceContainer
                ? ((containerClass ?? Container).find(registration.instanceContainer) as Promise<T>)
                : null,
        );
    }

    public static async createPublic<T extends TypeIndex>(
        this: ModelConstructor<T>,
        user: CompleteSolidUserProfile,
    ): Promise<ModelWithUrl<T>> {
        if (user.writableProfileUrl === null) {
            throw new SoukaiError("Can't create public type index without a writable profile document");
        }

        const fetch = TypeIndex.requireFetch();
        const url = await createTypeIndexDocument(user, 'public', fetch);

        await linkFromDocument(user.writableProfileUrl, user.webId, 'solid:publicTypeIndex', url, fetch);

        user.publicTypeIndexUrls.push(url);

        const instance = await this.findOrFail(url);

        try {
            await instance.updatePublicPermissions([SolidDocumentPermissions.Read]);
        } catch (error) {
            if (!isInstanceOf(error, UnsupportedAuthorizationProtocol)) {
                throw error;
            }

            // oxlint-disable-next-line no-console
            console.warn(`Public type index at ${url} could not be made public (${error.protocol})`);
        }

        return instance;
    }

    public static async createPrivate<T extends TypeIndex>(
        this: ModelConstructor<T>,
        user: CompleteSolidUserProfile,
    ): Promise<ModelWithUrl<T>> {
        if (user.preferencesFileUrl && user.cloakedDocumentUrls.includes(user.preferencesFileUrl)) {
            throw new CloakedPreferencesFile(
                user.preferencesFileUrl,
                `Can't create private type index because the preferences file at ${user.preferencesFileUrl} ` +
                    'could not be read (it may already link one)',
            );
        }

        const fetch = TypeIndex.requireFetch();

        user.preferencesFileUrl = await findOrCreatePreferencesFile(user, fetch);

        const url = await createTypeIndexDocument(user, 'private', fetch);

        await linkFromDocument(user.preferencesFileUrl, user.webId, 'solid:privateTypeIndex', url, fetch);

        user.privateTypeIndexUrls.push(url);

        return this.findOrFail(url);
    }
}

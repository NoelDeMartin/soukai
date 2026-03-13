import { TypeIndex } from 'soukai-bis';
import type { Container, ContainerConstructor, ModelConstructor } from 'soukai-bis';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import Model from './Person.schema';

export default class Person extends Model {

    public static createFromProfile(profile: SolidUserProfile): Person {
        return new Person(
            {
                url: profile.webId,
                storageUrls: profile.storageUrls,
                name: profile.name,
                avatarUrl: profile.avatarUrl,
                oidcIssuerUrl: profile.oidcIssuerUrl,
                publicTypeIndexUrls: profile.publicTypeIndexUrl ? [profile.publicTypeIndexUrl] : [],
                privateTypeIndexUrls: profile.privateTypeIndexUrl ? [profile.privateTypeIndexUrl] : [],
            },
            true,
        );
    }

    public async findRegisteredContainer<T extends Container = Container>(
        modelClass: ModelConstructor,
        containerClass?: ContainerConstructor<T>,
    ): Promise<T | null> {
        const typeIndexes = [...this.publicTypeIndexUrls, ...this.privateTypeIndexUrls];

        for (const typeIndexUrl of typeIndexes) {
            const typeIndex = await TypeIndex.find(typeIndexUrl);
            const container = typeIndex?.findContainer(modelClass, containerClass);

            if (!container) {
                continue;
            }

            return container;
        }

        return null;
    }

}

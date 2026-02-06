import { arrayEquals, asyncFirst } from '@noeldemartin/utils';
import { createPrivateTypeIndex } from '@noeldemartin/solid-utils';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import Container from 'soukai-bis/models/Container';
import type { ContainerConstructor, ModelConstructor } from 'soukai-bis/models/types';

import Model from './TypeIndex.schema';

export default class TypeIndex extends Model {

    public async findContainer<T extends Container = Container>(
        modelClass: ModelConstructor,
        containerClass?: ContainerConstructor<T>,
    ): Promise<T | null> {
        await this.loadRelationIfUnloaded('registrations');

        const containerRegistrations =
            this.registrations?.filter((registration) => {
                return (
                    registration.instanceContainer &&
                    arrayEquals(
                        registration.forClass,
                        modelClass.schema.rdfClasses.map((rdfClass) => rdfClass.value),
                    )
                );
            }) ?? [];

        return asyncFirst(containerRegistrations, async (registration) =>
            registration?.instanceContainer
                ? ((containerClass ?? Container).find(registration.instanceContainer) as Promise<T>)
                : null);
    }

    public static async createPrivate<T extends TypeIndex>(
        this: ModelConstructor<T>,
        user: SolidUserProfile,
    ): Promise<T> {
        const url = await createPrivateTypeIndex(user, TypeIndex.requireFetch());
        const instance = await this.findOrFail(url);

        return instance;
    }

}

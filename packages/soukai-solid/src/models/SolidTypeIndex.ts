import { arrayEquals, asyncFirst } from '@noeldemartin/utils';
import { SolidDocumentPermission, createPrivateTypeIndex, createPublicTypeIndex } from '@noeldemartin/solid-utils';
import type { Relation } from 'soukai';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import type { SolidModelConstructor } from 'soukai-solid/models/inference';

import DocumentContainsManyRelation from './relations/DocumentContainsManyRelation';
import Model from './SolidTypeIndex.schema';
import SolidContainer from './SolidContainer';
import SolidTypeRegistration from './SolidTypeRegistration';
import { usingExperimentalActivityPods } from 'soukai-solid/experimental';

export default class SolidTypeIndex extends Model {

    public static async createPublic<T extends SolidTypeIndex>(
        this: SolidModelConstructor<T>,
        user: SolidUserProfile,
    ): Promise<T> {
        const url = await createPublicTypeIndex(user, SolidTypeIndex.requireFetch());
        const instance = await this.findOrFail(url);

        await instance.updatePublicPermissions([SolidDocumentPermission.Read]);

        return instance;
    }

    public static async createPrivate<T extends SolidTypeIndex>(
        this: SolidModelConstructor<T>,
        user: SolidUserProfile,
    ): Promise<T> {
        const url = await createPrivateTypeIndex(user, SolidTypeIndex.requireFetch());
        const instance = await this.findOrFail(url);

        return instance;
    }

    declare public registrations: SolidTypeRegistration[];
    declare public relatedRegistrations: DocumentContainsManyRelation<
        this,
        SolidTypeRegistration,
        typeof SolidTypeRegistration
    >;

    public registrationsRelationship(): Relation {
        if (usingExperimentalActivityPods()) {
            return this.belongsToMany(SolidTypeRegistration, 'registrationUrls');
        }

        return new DocumentContainsManyRelation(this, SolidTypeRegistration);
    }

    public async findContainer<T extends SolidContainer = SolidContainer>(
        modelClass: SolidModelConstructor,
        containerClass?: SolidModelConstructor<T>,
    ): Promise<T | null> {
        await this.loadRelationIfUnloaded('registrations');

        const containerRegistrations = this.registrations.filter((registration) => {
            return registration.instanceContainer && arrayEquals(registration.forClass, modelClass.rdfsClasses);
        });

        return asyncFirst(containerRegistrations, async (registration) =>
            registration?.instanceContainer
                ? ((containerClass ?? SolidContainer).find(registration.instanceContainer) as Promise<T>)
                : null);
    }

}

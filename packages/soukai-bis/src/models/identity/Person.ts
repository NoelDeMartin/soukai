import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { arrayFilter } from '@noeldemartin/utils';
import { uniqueModels } from 'soukai-bis/models/identity/internals';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { TypeIndexRegistration } from 'soukai-bis/models/interop/TypeIndex';
import type Container from 'soukai-bis/models/ldp/Container';
import type BaseModel from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ContainerConstructor, ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import Model from './Person.schema';

export interface FindRegisteredOptions {
    registration?: TypeIndexRegistration;
}

export interface FindRegisteredContainersOptions<T extends Container = Container> extends FindRegisteredOptions {
    containerModelClass?: ContainerConstructor<T>;
}

export default class Person extends Model {
    public static createFromProfile<T extends Person>(
        this: ModelConstructor<T>,
        profile: CompleteSolidUserProfile,
    ): ModelWithUrl<T> {
        return this.newInstance(
            {
                url: profile.webId,
                storageUrls: profile.storageUrls,
                name: profile.name,
                avatarUrl: profile.avatarUrl,
                oidcIssuerUrl: profile.oidcIssuerUrl,
                publicTypeIndexUrls: profile.publicTypeIndexUrls,
                privateTypeIndexUrls: profile.privateTypeIndexUrls,
            },
            { exists: true },
        ) as ModelWithUrl<T>;
    }

    public async findTypeIndexes(): Promise<ModelWithUrl<TypeIndex>[]> {
        const [publicTypeIndexes, privateTypeIndexes] = await Promise.all([
            this.findPublicTypeIndexes(),
            this.findPrivateTypeIndexes(),
        ]);

        return [...publicTypeIndexes, ...privateTypeIndexes];
    }

    public async findPublicTypeIndexes(): Promise<ModelWithUrl<TypeIndex>[]> {
        return this.findTypeIndexesWithRegistration(this.publicTypeIndexUrls, 'public');
    }

    public async findPrivateTypeIndexes(): Promise<ModelWithUrl<TypeIndex>[]> {
        return this.findTypeIndexesWithRegistration(this.privateTypeIndexUrls, 'private');
    }

    public async findRegisteredContainers<T extends Container = Container>(
        modelClass: ModelConstructor,
        options: FindRegisteredContainersOptions<T> = {},
    ): Promise<ModelWithUrl<T>[]> {
        const typeIndexes = await this.findTypeIndexesForOptions(options);
        const containers = await Promise.all(
            typeIndexes.map((typeIndex) => typeIndex.findContainers(modelClass, options.containerModelClass)),
        );

        return uniqueModels(containers.flat());
    }

    public async findRegisteredInstances<T extends BaseModel>(
        modelClass: ModelConstructor<T>,
        options: FindRegisteredOptions = {},
    ): Promise<ModelWithUrl<T>[]> {
        const typeIndexes = await this.findTypeIndexesForOptions(options);
        const instances = await Promise.all(typeIndexes.map((typeIndex) => typeIndex.findInstances(modelClass)));

        return uniqueModels(instances.flat());
    }

    protected async findTypeIndexesForOptions(options: FindRegisteredOptions): Promise<ModelWithUrl<TypeIndex>[]> {
        switch (options.registration) {
            case 'public':
                return this.findPublicTypeIndexes();
            case 'private':
                return this.findPrivateTypeIndexes();
            default:
                return this.findTypeIndexes();
        }
    }

    protected async findTypeIndexesWithRegistration(
        urls: string[],
        registration: TypeIndexRegistration,
    ): Promise<ModelWithUrl<TypeIndex>[]> {
        const typeIndexes = await Promise.all(
            urls.map(async (url) => {
                const typeIndex = await requireBootedModel('TypeIndex').find(url);

                typeIndex?.setRegistration(registration);

                return typeIndex;
            }),
        );

        return arrayFilter(typeIndexes);
    }
}

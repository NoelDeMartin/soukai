import {
    CloakedPreferencesFile,
    SolidDocumentPermissions,
    UnsupportedAuthorizationProtocol,
    findOrCreatePreferencesFile,
    linkFromDocument,
} from '@noeldemartin/solid-utils';
import type { CompleteSolidUserProfile } from '@noeldemartin/solid-utils';
import { arrayFilter, arrayUnique, isInstanceOf, urlRoute } from '@noeldemartin/utils';
import type SolidEngine from 'soukai-bis/engines/SolidEngine';
import { requireSolidEngine } from 'soukai-bis/engines/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import Container from 'soukai-bis/models/ldp/Container';
import type BaseModel from 'soukai-bis/models/Model';
import type { ContainerConstructor, ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import { createTypeIndexDocument } from './internals';
import Model from './TypeIndex.schema';
import TypeRegistration from './TypeRegistration';

export type TypeIndexRegistration = 'public' | 'private';

export default class TypeIndex extends Model {
    public static requireEngine(): SolidEngine {
        return requireSolidEngine(super.requireEngine(), `use ${this.modelName} models`);
    }

    declare protected _registration: TypeIndexRegistration | null;

    public isPublicRegistration(): boolean | null {
        return this._registration ? this._registration === 'public' : null;
    }

    public isPrivateRegistration(): boolean | null {
        return this._registration ? this._registration === 'private' : null;
    }

    public setRegistration(registration: TypeIndexRegistration | null): void {
        this._registration = registration;
    }

    public async findRegistrations(modelClass: ModelConstructor): Promise<TypeRegistration[]> {
        const registrations = await this.loadRelationIfUnloaded('registrations');

        return registrations.filter((registration) => registration.registers(modelClass));
    }

    public async findContainerUrls(modelClass: ModelConstructor): Promise<string[]> {
        const registrations = await this.findRegistrations(modelClass);

        return arrayUnique(
            registrations
                .filter((registration) => registration.registersContainer())
                .map((registration) => registration.instanceContainer),
        );
    }

    public async findContainers<T extends Container = Container>(
        modelClass: ModelConstructor,
        containerModelClass?: ContainerConstructor<T>,
    ): Promise<ModelWithUrl<T>[]> {
        const containerUrls = await this.findContainerUrls(modelClass);
        const containers = await Promise.all(
            containerUrls.map((url) => (containerModelClass ?? Container).find(url) as Promise<ModelWithUrl<T> | null>),
        );

        return arrayFilter(containers);
    }

    public async findInstanceUrls(modelClass: ModelConstructor): Promise<string[]> {
        const registrations = await this.findRegistrations(modelClass);

        return arrayUnique(
            registrations
                .filter((registration) => registration.registersInstance())
                .map((registration) => registration.instance),
        );
    }

    public async findInstances<T extends BaseModel>(modelClass: ModelConstructor<T>): Promise<ModelWithUrl<T>[]> {
        const instanceUrls = await this.findInstanceUrls(modelClass);

        if (instanceUrls.length === 0) {
            return [];
        }

        const models = await modelClass.all({ $in: arrayUnique(instanceUrls.map((url) => urlRoute(url))) });

        return models.filter(
            (model) => instanceUrls.includes(model.url) || instanceUrls.includes(model.requireDocumentUrl()),
        );
    }

    public async registerContainer(container: string | Container, modelClass: ModelConstructor): Promise<void> {
        const containerUrl = typeof container === 'string' ? container : container.requireUrl();

        await this.createRegistration(modelClass, { instanceContainer: containerUrl }, (registration) => {
            return registration.instanceContainer === containerUrl;
        });
    }

    public async registerInstance(instance: BaseModel): Promise<void>;
    public async registerInstance(instanceUrl: string, modelClass: ModelConstructor): Promise<void>;
    public async registerInstance(instance: string | BaseModel, modelClass?: ModelConstructor): Promise<void> {
        const instanceUrl = typeof instance === 'string' ? instance : instance.requireUrl();
        const instanceModelClass = typeof instance === 'string' ? modelClass : instance.static();

        if (!instanceModelClass) {
            throw new SoukaiError(
                `Can't register instance ${instanceUrl} without specifying the registered model class`,
            );
        }

        await this.createRegistration(instanceModelClass, { instance: instanceUrl }, (registration) => {
            return registration.instance === instanceUrl;
        });
    }

    protected initialize(...[attributes, options]: ConstructorParameters<typeof Model>): void {
        super.initialize(attributes, options);

        this._registration = null;
    }

    protected async createRegistration(
        modelClass: ModelConstructor,
        attributes: { instance?: string; instanceContainer?: string },
        matches: (registration: TypeRegistration) => boolean,
    ): Promise<void> {
        const registrations = await this.findRegistrations(modelClass);

        if (registrations.some(matches)) {
            return;
        }

        const registration = new TypeRegistration({ forClass: modelClass.getRdfClasses(), ...attributes });

        this.relatedRegistrations.attach(registration);

        await this.relatedRegistrations.save(registration);
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

        await linkFromDocument(user.writableProfileUrl, user.webId, 'solid:publicTypeIndex', url, { fetch });

        user.publicTypeIndexUrls.push(url);

        const instance = await this.findOrFail(url);

        instance.setRegistration('public');

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

        user.preferencesFileUrl = await findOrCreatePreferencesFile(user, { fetch });

        const url = await createTypeIndexDocument(user, 'private', fetch);

        await linkFromDocument(user.preferencesFileUrl, user.webId, 'solid:privateTypeIndex', url, { fetch });

        user.privateTypeIndexUrls.push(url);

        const instance = await this.findOrFail(url);

        instance.setRegistration('private');

        return instance;
    }
}

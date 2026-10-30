import {
    arrayFilter,
    arrayFrom,
    arrayUnique,
    requireUrlParentDirectory,
    urlResolveDirectory,
    uuid,
} from '@noeldemartin/utils';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import TypeRegistration from 'soukai-bis/models/interop/TypeRegistration';
import type { MintUrlOptions, UrlFromSlugOptions } from 'soukai-bis/models/Model';
import { requireBootedModel } from 'soukai-bis/models/registry';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import Model from './Container.schema';

export default class Container extends Model {
    public static urlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        return this.documentUrlFromSlug(slug, options);
    }

    public static documentUrlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        return urlResolveDirectory(super.documentUrlFromSlug(slug, options));
    }

    public static async createFromTypeIndex<T extends Container>(
        this: ModelConstructor<T>,
        typeIndex: string | ModelWithUrl<TypeIndex>,
        childrenModelClass: ModelConstructor,
    ): Promise<ModelWithUrl<T>[]> {
        const typeIndexInstance =
            typeof typeIndex === 'string' ? await requireBootedModel('TypeIndex').findOrFail(typeIndex) : typeIndex;
        const registrations = await typeIndexInstance.loadRelationIfUnloaded<TypeRegistration[]>('registrations');
        const urls = arrayUnique(
            arrayFilter(
                registrations
                    .filter((registration) => registration.registers(childrenModelClass))
                    .map((registration) => registration.instanceContainer),
            ),
        );

        return urls.map((url) => this.newInstance({ url }, { exists: true }) as ModelWithUrl<T>);
    }

    public async register(
        typeIndex: string | TypeIndex,
        childrenModelClasses: ModelConstructor | Array<ModelConstructor>,
    ): Promise<void> {
        const typeRegistration = new TypeRegistration({
            forClass: arrayFrom(childrenModelClasses)
                .map((modelClass) => modelClass.schema.rdfClasses.map((rdfClass) => rdfClass.value))
                .flat(),
            instanceContainer: this.requireUrl(),
        });

        if (typeof typeIndex === 'string') {
            typeRegistration.mintUrl({
                documentUrl: typeIndex,
                documentExists: true,
                resourceHash: uuid(),
            });

            await typeRegistration.save(requireUrlParentDirectory(typeIndex));

            return;
        }

        await typeIndex.loadRelationIfUnloaded('registrations');

        const alreadyRegistered = typeIndex.registrations?.some((registration) => {
            return (
                typeRegistration.instanceContainer === registration.instanceContainer &&
                !typeRegistration.forClass.some((type) => !registration.forClass.includes(type))
            );
        });

        if (alreadyRegistered) {
            return;
        }

        typeIndex.relatedRegistrations.attach(typeRegistration);

        await typeIndex.relatedRegistrations.save(typeRegistration);
    }

    public setAttributes(attributes: Partial<Record<string, unknown>>): void {
        super.setAttributes(attributes);

        this._dirtyAttributes.delete('resourceUrls');
    }

    protected newUrl(options: MintUrlOptions = {}): string {
        return urlResolveDirectory(this.newUrlDocumentUrl(options));
    }
}

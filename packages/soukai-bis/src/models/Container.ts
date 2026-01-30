import { arrayFrom, requireUrlParentDirectory, urlResolveDirectory, uuid } from '@noeldemartin/utils';

import Model from './Container.schema';
import TypeRegistration from './interop/TypeRegistration';
import type TypeIndex from './interop/TypeIndex';
import type { ModelConstructor } from './types';
import type { MintUrlOptions } from './Model';

export default class Container extends Model {

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

    protected newUrl(options: MintUrlOptions = {}): string {
        return urlResolveDirectory(this.newUrlDocumentUrl(options));
    }

}

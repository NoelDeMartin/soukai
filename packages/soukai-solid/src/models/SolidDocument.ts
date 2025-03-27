import { findInstanceRegistrations } from '@noeldemartin/solid-utils';
import { requireUrlParentDirectory, uuid } from '@noeldemartin/utils';

import { SolidEngine } from 'soukai-solid/engines/SolidEngine';

import Model from './SolidDocument.schema';
import SolidTypeRegistration from './SolidTypeRegistration';
import type SolidTypeIndex from './SolidTypeIndex';
import type { SolidModel } from './SolidModel';
import type { SolidModelConstructor } from './inference';

export default class SolidDocument extends Model {

    public static async fromTypeIndex<T extends SolidDocument>(
        this: SolidModelConstructor<T>,
        typeIndexUrl: string,
        modelClass: typeof SolidModel,
    ): Promise<T[]> {
        const engine = this.requireFinalEngine();
        const fetch = engine instanceof SolidEngine ? engine.getFetch() : undefined;
        const urls = await findInstanceRegistrations(typeIndexUrl, modelClass.rdfsClasses, fetch);

        return urls.map((url) => this.newInstance({ url }, true));
    }

    public async register(typeIndex: string | SolidTypeIndex, modelClass: typeof SolidModel): Promise<void> {
        const typeRegistration = new SolidTypeRegistration({
            forClass: modelClass.rdfsClasses[0],
            instance: this.url,
        });

        if (typeof typeIndex === 'string') {
            typeRegistration.mintUrl(typeIndex, true, uuid());

            await typeRegistration.withEngine(this.requireEngine(), () =>
                typeRegistration.save(requireUrlParentDirectory(typeIndex)));

            return;
        }

        await typeIndex.withEngine(this.requireEngine(), async () => {
            await typeIndex.loadRelationIfUnloaded('registrations');
            await typeIndex.relatedRegistrations.create(typeRegistration);
        });
    }

}

import { arrayUnique, urlRoute } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { getResourceMediaTypes, isNonRDFMediaTypes } from 'soukai-bis/lib/internals/files';
import { resolveTypeIndex } from 'soukai-bis/models/interop/internals';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import type { ModelConstructorOptions } from 'soukai-bis/models/Model';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import Model from './Resource.schema';

export default class Resource extends Model {
    public static async createFromTypeIndex<T extends Resource>(
        this: ModelConstructor<T>,
        typeIndex: string | TypeIndex,
        modelClass: ModelConstructor,
    ): Promise<ModelWithUrl<T>[]> {
        const typeIndexInstance = await resolveTypeIndex(typeIndex);
        const instanceUrls = await typeIndexInstance.findInstanceUrls(modelClass);
        const urls = arrayUnique(instanceUrls.map((url) => urlRoute(url)));

        return urls.map((url) => this.newInstance({ url }, { exists: true }) as ModelWithUrl<T>);
    }

    declare protected _mediaTypes: string[];

    public get mediaTypes(): string[] {
        return this._mediaTypes.slice(0);
    }

    public get mimeType(): string | undefined {
        return this._mediaTypes[0];
    }

    public isContainer(): boolean {
        return !!this.url?.endsWith('/');
    }

    public isFile(): boolean {
        return !this.isContainer() && isNonRDFMediaTypes(this._mediaTypes);
    }

    public async register(typeIndex: string | TypeIndex, modelClass?: ModelConstructor): Promise<void> {
        if (!modelClass) {
            throw new SoukaiError(`Can't register resources without specifying the registered model class`);
        }

        const typeIndexInstance = await resolveTypeIndex(typeIndex);

        await typeIndexInstance.registerInstance(this.requireUrl(), modelClass);
    }

    protected initialize(attributes: Record<string, unknown> = {}, options: ModelConstructorOptions = {}): void {
        super.initialize(attributes, options);

        const url = typeof attributes.url === 'string' ? attributes.url : null;

        this._mediaTypes = url && options.source ? getResourceMediaTypes(options.source, url) : [];
    }
}

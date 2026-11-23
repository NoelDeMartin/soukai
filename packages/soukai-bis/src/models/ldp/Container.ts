import { requireUrlParentDirectory, urlResolveDirectory } from '@noeldemartin/utils';
import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { deleteFile, uploadFile } from 'soukai-bis/lib/internals/files';
import type { DeleteFileOptions, UploadFileOptions } from 'soukai-bis/lib/internals/files';
import { refreshComputedAttributes } from 'soukai-bis/models/computed-attributes/registry';
import { emitModelInstanceEvent } from 'soukai-bis/models/events';
import { resolveTypeIndex } from 'soukai-bis/models/interop/internals';
import type TypeIndex from 'soukai-bis/models/interop/TypeIndex';
import { tracksLocalChanges } from 'soukai-bis/models/local-changes';
import type { BeforeSaveOptions, MintUrlOptions, UrlFromSlugOptions } from 'soukai-bis/models/Model';
import type { ModelConstructor, ModelWithUrl } from 'soukai-bis/models/types';

import Model from './Container.schema';
import type Resource from './Resource';

export default class Container extends Model {
    public static urlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        return this.documentUrlFromSlug(slug, options);
    }

    public static documentUrlFromSlug(slug: string, options: UrlFromSlugOptions = {}): string {
        return urlResolveDirectory(super.documentUrlFromSlug(slug, options));
    }

    public static async createFromTypeIndex<T extends Container>(
        this: ModelConstructor<T>,
        typeIndex: string | TypeIndex,
        modelClass: ModelConstructor,
    ): Promise<ModelWithUrl<T>[]> {
        const typeIndexInstance = await resolveTypeIndex(typeIndex);
        const urls = await typeIndexInstance.findContainerUrls(modelClass);

        return urls.map((url) => this.newInstance({ url }, { exists: true }) as ModelWithUrl<T>);
    }

    public get files(): Resource[] {
        return (this.resources ?? []).filter((resource) => resource.isFile());
    }

    public get fileUrls(): string[] {
        return this.files.map((file) => file.requireUrl());
    }

    public async register(typeIndex: string | TypeIndex, modelClass?: ModelConstructor): Promise<void> {
        if (!modelClass) {
            throw new SoukaiError(`Can't register containers without specifying the registered model class`);
        }

        const typeIndexInstance = await resolveTypeIndex(typeIndex);

        await typeIndexInstance.registerContainer(this, modelClass);
    }

    public async uploadFile(blob: Blob, options: UploadFileOptions = {}): Promise<string> {
        const url = await uploadFile(this.requireUrl(), blob, {
            ...options,
            trackLocalChanges: options.trackLocalChanges ?? tracksLocalChanges(this.static()),
            engine: this.static().requireEngine(),
        });

        await this.afterFilesChanged();
        await emitModelInstanceEvent(this, 'file-uploaded', { url, blob });

        return url;
    }

    public async deleteFile(url: string, options: DeleteFileOptions = {}): Promise<void> {
        if (requireUrlParentDirectory(url) !== this.requireUrl()) {
            throw new SoukaiError(
                `Can't delete file ${url} from container ${this.url}, it belongs to another container.`,
            );
        }

        await deleteFile(url, {
            trackLocalChanges: options.trackLocalChanges ?? tracksLocalChanges(this.static()),
            engine: this.static().requireEngine(),
        });
        await this.afterFilesChanged();
        await emitModelInstanceEvent(this, 'file-deleted', { url });
    }

    public setAttributes(attributes: Partial<Record<string, unknown>>): void {
        super.setAttributes(attributes);

        this._dirtyAttributes.delete('resourceUrls');
    }

    protected newUrl(options: MintUrlOptions = {}): string {
        return urlResolveDirectory(this.newUrlDocumentUrl(options));
    }

    protected async beforeSave(options: BeforeSaveOptions = {}): Promise<void> {
        if (this.isMarkedForDeletion() && this.exists()) {
            await this.assertEmpty();
        }

        await super.beforeSave(options);
    }

    private async afterFilesChanged(): Promise<void> {
        const freshInstance = await this.fresh();

        this._attributes = freshInstance._attributes;
        this._originalAttributes = freshInstance._originalAttributes;
        this._dirtyAttributes = new Set();
        this.getRelation('resources').related = freshInstance.getRelation('resources').related;

        await refreshComputedAttributes(this.getRelatedModels());
    }

    private async assertEmpty(): Promise<void> {
        const container = await Container.find(this.requireDocumentUrl());

        if (container && container.resourceUrls.length > 0) {
            throw new SoukaiError(
                `Can't delete container ${this.url} because it isn't empty, delete its documents first.`,
            );
        }
    }
}

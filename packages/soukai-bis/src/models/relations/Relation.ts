import { type Nullable, required } from '@noeldemartin/utils';

import type Model from 'soukai-bis/models/Model';
import type { ModelConstructor } from 'soukai-bis/models/types';

import type { RelationConstructor } from './types';

export default abstract class Relation<
    Parent extends Model = Model,
    Related extends Model = Model,
    RelatedClass extends ModelConstructor<Related> = ModelConstructor<Related>,
> {

    public static newInstance<T extends Relation>(
        this: RelationConstructor<T>,
        parent: Model,
        relatedClass: ModelConstructor,
        options?: { foreignKeyName?: string; localKeyName?: string },
    ): T {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (this as any)(parent, relatedClass, options);
    }

    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;
    public loaded: boolean = false;
    protected _related: Nullable<Related | Related[]> = null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        options: { foreignKeyName?: string; localKeyName?: string } = {},
    ) {
        this.parent = parent;
        this.relatedClass = relatedClass;
        this.foreignKeyName = required(
            options.foreignKeyName,
            `foreignKeyName missing from relation in ${parent.static().modelName} for ${relatedClass.modelName}.`,
        );
        this.localKeyName = options.localKeyName ?? 'url';
    }

    public get related(): Nullable<Related | Related[]> {
        return this._related;
    }

    public set related(related: Nullable<Related | Related[]>) {
        this._related = related;
        this.loaded = true;
    }

    public unload(): void {
        this.related = null;
        this.loaded = false;
    }

    public abstract load(): Promise<Related | Related[] | null>;

}

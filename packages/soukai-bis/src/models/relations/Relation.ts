import { type Nullable, arrayFrom, required } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { isModelClass } from 'soukai-bis/models/utils';
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
        options?: { foreignKeyName?: string; localKeyName?: string; usingSameDocument?: boolean },
    ): T {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (this as any)(parent, relatedClass, options);
    }

    public static validateRelatedClass(parent: Model, relatedClass: unknown): void {
        if (isModelClass(relatedClass)) {
            return;
        }

        throw new SoukaiError(
            `Relation for model ${parent.static().modelName} is not defined correctly, ` +
                'related value is not a model class.',
        );
    }

    public parent: Parent;
    public relatedClass: RelatedClass;
    public foreignKeyName: string;
    public localKeyName: string;
    public usingSameDocument: boolean = false;
    protected _related: Nullable<Related | Related[]> = null;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        options: { foreignKeyName?: string; localKeyName?: string; usingSameDocument?: boolean } = {},
    ) {
        this.parent = parent;
        this.relatedClass = relatedClass;
        this.foreignKeyName = required(
            options.foreignKeyName,
            `foreignKeyName missing from relation in ${parent.static().modelName} for ${relatedClass.modelName}.`,
        );
        this.localKeyName = options.localKeyName ?? 'url';
        this.usingSameDocument = options.usingSameDocument ?? false;
    }

    public get related(): Nullable<Related | Related[]> {
        return this._related;
    }

    public set related(related: Nullable<Related | Related[]>) {
        this._related = related;
    }

    public get loaded(): boolean {
        return this.related !== undefined;
    }

    public getLoadedModels(): Related[] {
        return this.related ? (arrayFrom(this.related) as Related[]) : [];
    }

    public unload(): void {
        this.related = null;
    }

    public abstract load(): Promise<Related | Related[] | null>;
    public abstract setForeignAttributes(related: Related): void;

}

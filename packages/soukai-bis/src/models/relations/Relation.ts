import { arrayFrom, required, tap } from '@noeldemartin/utils';
import type { Quad } from '@rdfjs/types';
import type { Nullable } from '@noeldemartin/utils';

import SoukaiError from 'soukai-bis/errors/SoukaiError';
import { isModelClass } from 'soukai-bis/models/utils';
import type Model from 'soukai-bis/models/Model';
import type { GetModelInput, ModelConstructor } from 'soukai-bis/models/types';

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
    public foreignKeyName: string | null;
    public localKeyName: string;
    public usingSameDocument: boolean = false;
    public documentModelsLoaded: boolean = false;
    protected _related: Nullable<Related | Related[]> = undefined;

    public constructor(
        parent: Parent,
        relatedClass: RelatedClass,
        options: { foreignKeyName?: string; localKeyName?: string; usingSameDocument?: boolean } = {},
    ) {
        this.parent = parent;
        this.relatedClass = relatedClass;
        this.foreignKeyName = this.requiresForeignKey()
            ? required(
                options.foreignKeyName,
                `foreignKeyName missing from relation in ${parent.static().modelName} for ${relatedClass.modelName}.`,
            )
            : (options.foreignKeyName ?? null);
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

    public requireForeignKeyName(): string {
        return required(this.foreignKeyName);
    }

    public unload(): void {
        this.related = undefined;
    }

    public async save(model: Related): Promise<Related> {
        this.assertLoaded('save');
        this.attach(model);

        if (!this.usingSameDocument) {
            await model.save();

            this.setForeignAttributes(model);
        }

        if (this.parent.exists()) {
            await this.parent.save();
        }

        return model;
    }

    public async create(attributes: GetModelInput<RelatedClass>): Promise<Related> {
        return tap(this.attach(attributes), (model) => this.save(model));
    }

    public abstract load(): Promise<Related | Related[] | null>;
    public abstract loadFromDocumentRDF(quads: Quad[], options?: { modelsCache?: Map<string, Model> }): Promise<void>;
    public abstract setForeignAttributes(related: Related): void;
    public abstract isEmpty(): boolean | null;
    public abstract attach(model: Related): Related;
    public abstract attach(attributes: GetModelInput<RelatedClass>): Related;

    protected requiresForeignKey(): boolean {
        return true;
    }

    protected assertLoaded(method: string): this is { related: Related[] } {
        if (this.loaded) {
            return true;
        }

        if (!this.parent.exists() || this.isEmpty()) {
            this.related = [];

            return true;
        }

        throw new SoukaiError(`The "${method}" method can't be called before loading the relationship`);
    }

}

import type Model from 'soukai-bis/models/Model';

export type ModelConstructor<T extends Model = Model> = { new (...args: any[]): T } & Omit<typeof Model, 'new'>;
export type MintedModel<T extends Model> = T & { url: string };
export type BootedModelClass<T extends typeof Model> = T & { _collection: string; _modelName: string };

import { MagicObject } from '@noeldemartin/utils';
import { quadsToJsonLD, quadsToTurtle } from '@noeldemartin/solid-utils';
import type { JsonLD } from '@noeldemartin/solid-utils';

import { serializeToRDF } from './concerns/serializes-to-rdf';
import type { Schema } from './schema';

export default class Model extends MagicObject {

    public static schema: Schema;

    public static<T extends typeof Model>(): T;
    public static<T extends typeof Model, K extends keyof T>(property: K): T[K];
    public static<T extends typeof Model, K extends keyof T>(property?: K): T | T[K] {
        return super.static<T, K>(property as K);
    }

    declare public url?: string;
    private __attributes: Record<string, unknown>;

    public constructor(attributes: Record<string, unknown> = {}) {
        super();

        if (this.static().isConjuring()) {
            this.__attributes = {};

            return;
        }

        this.__attributes = this.static().schema.fields.parse(attributes);
    }

    public getAttributes(): Record<string, unknown> {
        return this.__attributes;
    }

    public async toJsonLD(): Promise<JsonLD> {
        return quadsToJsonLD(serializeToRDF(this));
    }

    public async toTurtle(): Promise<string> {
        return quadsToTurtle(serializeToRDF(this));
    }

    protected __get(property: string): unknown {
        return this.__attributes[property];
    }

}

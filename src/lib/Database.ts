export type Key = string;

export type Value = string | number | boolean | Key;

export interface Attributes {
    [field: string]: Value | Value[] | Attributes;
}

export interface Document extends Attributes {
    id: Key;
}

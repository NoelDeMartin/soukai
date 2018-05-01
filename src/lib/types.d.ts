declare module Soukai {

    export type PrimaryKey = string | number;

    export interface Attributes {
        [key: string]: any | Attributes;
    }

    export interface Document extends Attributes {
        id: PrimaryKey;
    }

}
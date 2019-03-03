import { Database } from './engines';

export class SoukaiError implements Error {

    public name: string;
    public message: string;
    public stack?: string;

    constructor(...args: any[]);

}

export class InvalidModelDefinition extends SoukaiError {

    new (name: string, message: string): InvalidModelDefinition;

}

export class DocumentNotFound extends SoukaiError {

    new(key: Database.Key): DocumentNotFound;

}


export class SoukaiError implements Error {

    public name: string;
    public message: string;
    public stack?: string;

    constructor(...args: any[]);

}

export class InvalidModelDefinition extends SoukaiError {

    constructor(name: string, message: string);

}

export class DocumentNotFound extends SoukaiError {

    constructor(id: string);

}


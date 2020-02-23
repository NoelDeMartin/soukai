export class SoukaiError implements Error {

    public name: string;
    public message: string;
    public stack?: string;

    constructor(...args: any[]);

}

export class InvalidModelDefinition extends SoukaiError {

    public readonly modelName: string;

    constructor(modelName: string, message: string);

}

export class DocumentNotFound extends SoukaiError {

    public readonly id: string;

    constructor(id: string);

}

export class DocumentAlreadyExists extends SoukaiError {

    public readonly id: string;

    constructor(id: string);

}

export class SoukaiError extends Error {

    constructor(message?: string);

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

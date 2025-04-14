import SoukaiError from 'soukai/errors/SoukaiError';
import type { SoukaiErrorOptions } from 'soukai/errors/SoukaiError';
import type { Attributes } from 'soukai/models/attributes';

export default class InvalidModelAttributes extends SoukaiError {

    public readonly modelName: string;
    public readonly attributes: Attributes;

    constructor(modelName: string, attributes: Attributes, options?: SoukaiErrorOptions) {
        super(`Model ${modelName}: Invalid attributes (${JSON.stringify(attributes)}).`, options);

        this.modelName = modelName;
        this.attributes = attributes;
    }

}

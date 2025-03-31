import SoukaiError from 'soukai/errors/SoukaiError';

export default class InvalidModelDefinition extends SoukaiError {

    public readonly modelName: string;

    constructor(modelName: string, message: string) {
        super(`Model ${modelName}: ${message}. Learn more at https://soukai.js.org/guide/core-concepts/models.html`);

        this.modelName = modelName;
    }

}

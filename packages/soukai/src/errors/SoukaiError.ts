export interface SoukaiErrorOptions {
    cause?: unknown;
}

export default class SoukaiError extends Error {

    constructor(message?: string, options?: SoukaiErrorOptions) {
        super(...(options ? ([message, options] as unknown as [string]) : [message]));

        // Fix inheritance: https://stackoverflow.com/questions/41102060/typescript-extending-error-class
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }

}

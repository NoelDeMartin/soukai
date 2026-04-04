import type { ZodError, core } from 'zod';

import SoukaiError from './SoukaiError';

export default class InvalidAttributesError extends SoukaiError {

    public readonly modelName: string;
    public readonly issues: core.$ZodIssue[];

    constructor(modelName: string, cause: ZodError) {
        super(`Invalid attributes in ${modelName} (${JSON.stringify(cause.issues)}).`, { cause });

        this.modelName = modelName;
        this.issues = cause.issues;
    }

}

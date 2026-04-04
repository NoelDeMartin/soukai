import type { ZodError, core } from 'zod';

import SoukaiError from './SoukaiError';

export default class InvalidAttributeError extends SoukaiError {

    public readonly modelName: string;
    public readonly field: string;
    public readonly issues: core.$ZodIssue[];

    constructor(modelName: string, field: string, cause: ZodError) {
        super(`Invalid '${field}' attribute in ${modelName} (${JSON.stringify(cause.issues)}).`, { cause });

        this.modelName = modelName;
        this.field = field;
        this.issues = cause.issues;
    }

}

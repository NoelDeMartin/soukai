import { JSError } from '@noeldemartin/utils';
import type { JSErrorOptions } from '@noeldemartin/utils';

export default class SoukaiError extends JSError {

    constructor(message?: string, options?: JSErrorOptions) {
        super(message, options);
    }

}

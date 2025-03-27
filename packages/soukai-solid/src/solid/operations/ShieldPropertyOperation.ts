import { OperationTypes } from './Operation';
import type Operation from './Operation';

export default class ShieldPropertyOperation implements Operation {

    public type: typeof OperationTypes.ShieldProperty = OperationTypes.ShieldProperty;

    constructor(
        public resourceUrl: string,
        public property: string,
    ) {}

}

import { OperationTypes } from './Operation';
import type Operation from './Operation';

export default class RemovePropertyOperation implements Operation {

    public type: typeof OperationTypes.RemoveProperty = OperationTypes.RemoveProperty;

    constructor(
        public resourceUrl: string,
        public property?: string,
        public value?: unknown,
    ) {}

}

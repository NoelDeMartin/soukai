import { OperationTypes } from './Operation';
import type Operation from './Operation';

export default class ChangeUrlOperation implements Operation {

    public type: typeof OperationTypes.ChangeUrl = OperationTypes.ChangeUrl;

    constructor(
        public resourceUrl: string,
        public newResourceUrl: string,
    ) {}

}

import TestSuite from '../TestSuite';

import Soukai from '../../../src/lib/Soukai';
import Model from '../../../src/lib/Model';

export default class extends TestSuite {

    static title: string = 'Boot';

    public testValidateCollection(): void {
        class StubModel extends Model {
            static collection = 'collection';
        }

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('collection');
    }

    public testGenerateCollectionName(): void {
        class StubModel extends Model {}

        Soukai.loadModel('Stub', StubModel);

        expect(StubModel.collection).toBe('stubs');
    }

}

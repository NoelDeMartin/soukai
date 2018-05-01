import TestSuite from '../TestSuite';
import MockEngine from '../mocks/MockEngine';

import Model from '../../../src/lib/Model';
import Soukai from '../../../src/lib/Soukai';
import Engine from '../../../src/lib/Engine';

class StubModel extends Model {
    static collection = 'collection';
}

export default class extends TestSuite {

    static title: string = 'CRUD';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
        Soukai.loadModel('Stub', StubModel);
    }

    public testCreate(): void {
        const attributes = { foo: 'bar' };

        StubModel.create(attributes);

        expect(this.mockEngine.create).toHaveBeenCalledTimes(1);
        expect(this.mockEngine.create).toHaveBeenCalledWith('collection', attributes);
    }

}

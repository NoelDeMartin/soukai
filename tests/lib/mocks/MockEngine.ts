import Engine from '../../../src/lib/Engine';

export default jest.fn<jest.Mocked<Engine>>(() => {
    return {
        create: jest.fn(() => Promise.resolve(1)),
        readOne: jest.fn(() => Promise.resolve({})),
        readAll: jest.fn(() => Promise.resolve([])),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
    };
});

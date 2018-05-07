import Faker from 'faker';

import Engine from '@/lib/Engine';

export default jest.fn<jest.Mocked<Engine>>(() => {
    return {
        create: jest.fn(() => Promise.resolve(Faker.random.uuid())),
        readOne: jest.fn(() => Promise.resolve({ id: Faker.random.uuid() })),
        readMany: jest.fn(() => Promise.resolve([])),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
    };
});

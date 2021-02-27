import Faker from 'faker';

import { Engine } from '@/engines';

export default jest.fn<jest.Mocked<Engine>, []>((): jest.Mocked<Engine> => {
    return {
        create: jest.fn(() => Promise.resolve(Faker.random.uuid())),
        readOne: jest.fn(() => Promise.resolve({ id: Faker.random.uuid() })),
        readMany: jest.fn(() => Promise.resolve([])),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
    } as unknown as jest.Mocked<Engine>;
});

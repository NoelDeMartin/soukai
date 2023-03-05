import { faker } from '@noeldemartin/faker';

import type { Engine } from '@/engines';

export default jest.fn<jest.Mocked<Engine>, []>((): jest.Mocked<Engine> => {
    return {
        create: jest.fn(() => Promise.resolve(faker.datatype.uuid())),
        readOne: jest.fn(() => Promise.resolve({ id: faker.datatype.uuid() })),
        readMany: jest.fn(() => Promise.resolve([])),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
    } as unknown as jest.Mocked<Engine>;
});

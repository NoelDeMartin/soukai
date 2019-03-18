import Faker from 'faker';

import Engine from '@/lib/Engine';
import Model, { FieldType } from '@/lib/Model';
import Soukai from '@/lib/Soukai';

import { seconds, wait } from '../utils';

import TestSuite from '../TestSuite';

import StubModel from '../stubs/StubModel';

import MockEngine from '../mocks/MockEngine';

export default class extends TestSuite {

    public static title: string = 'Attributes';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        StubModel.load();
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
    }

    public testAttributeGetter(): void {
        const name = Faker.name.firstName();
        const model = new StubModel({ name });

        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
    }

    public testAttributeSetter(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name: initialName, surname })
            .then(model => wait().then(() => {
                model.name = newName;
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updated_at).toBeInstanceOf(Date);
                expect(now - seconds(model.updated_at)).toBeLessThan(1);
                expect(model.updated_at.getTime()).toBeGreaterThan(model.created_at.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    StubModel,
                    id,
                    {
                        name: newName,
                        updated_at: model.updated_at,
                    },
                    [],
                );
            });
    }

    public testAttributeDeleter(): Promise<void> {
        const id = Faker.random.uuid();
        const name = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return StubModel.create({ name, surname: Faker.name.lastName() })
            .then(model => wait().then(() => {
                delete model.surname;
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(StubModel);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(model.getAttributes(true)).toHaveProperty('surname');
                expect(model.updated_at).toBeInstanceOf(Date);
                expect(now - seconds(model.updated_at)).toBeLessThan(1);
                expect(model.updated_at.getTime()).toBeGreaterThan(model.created_at.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    StubModel,
                    id,
                    { updated_at: model.updated_at },
                    ['surname'],
                );
            });
    }

    public testUndefinedAttributes(): void {
        const model = new StubModel({ contact: { phone: Faker.phone.phoneNumber() } });

        expect(model.hasAttribute('name')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('name');
        expect(model.getAttributes(true)).toHaveProperty('name');
        expect(model.hasAttribute('contact')).toBe(true);
        expect(model.hasAttribute('contact.phone')).toBe(true);
        expect(model.hasAttribute('contact.email')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('contact.email');
        expect(model.getAttributes(true)).toHaveProperty('contact.email');
        expect(model.hasAttribute('social')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('social');
        expect(model.getAttributes(true)).toHaveProperty('social');
        expect(model.getAttributes(true)).toHaveProperty('social.facebook');
        expect(model.getAttributes(true)).toHaveProperty('social.twitter');
        expect(model.hasAttribute('birth_date')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('birth_date');
        expect(model.getAttributes(true)).toHaveProperty('birth_date');
    }

}

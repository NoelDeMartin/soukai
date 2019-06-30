import Faker from 'faker';

import Engine from '@/engines/Engine';
import Soukai from '@/Soukai';

import { seconds, wait } from '../utils';

import TestSuite from '../TestSuite';

import User from '../stubs/User';

import MockEngine from '../mocks/MockEngine';

export default class extends TestSuite {

    public static title: string = 'Attributes';

    private mockEngine: jest.Mocked<Engine>;

    public setUp(): void {
        User.load();
        MockEngine.mockClear();

        Soukai.useEngine(this.mockEngine = new MockEngine());
    }

    public testAttributeGetter(): void {
        const name = Faker.name.firstName();
        const model = new User({ name });

        expect(model.name).toBe(name);
        expect(model.surname).toBeUndefined();
    }

    public testAttributeAccessor(): void {
        const name = Faker.name.firstName();
        const model = new User({ name });

        expect(model.alias).toBe(name);
    }

    public testAttributeSetter(): Promise<void> {
        const id = Faker.random.uuid();
        const surname = Faker.name.lastName();
        const initialName = Faker.name.firstName();
        const newName = Faker.name.firstName();
        const now = seconds();

        this.mockEngine.create.mockReturnValue(Promise.resolve(id));

        return User.create({ name: initialName, surname })
            .then(model => wait().then(() => {
                model.name = newName;
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(newName);
                expect(model.surname).toBe(surname);
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    {
                        name: newName,
                        updatedAt: model.updatedAt,
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

        return User.create({ name, surname: Faker.name.lastName() })
            .then(model => wait().then(() => {
                delete model.surname;
                return model.save();
            }))
            .then(model => {
                expect(model).toBeInstanceOf(User);
                expect(model.id).toBe(id);
                expect(model.name).toBe(name);
                expect(model.surname).toBeUndefined();
                expect(model.getAttributes(true)).toHaveProperty('surname');
                expect(model.updatedAt).toBeInstanceOf(Date);
                expect(now - seconds(model.updatedAt)).toBeLessThan(1);
                expect(model.updatedAt.getTime()).toBeGreaterThan(model.createdAt.getTime());
                expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
                expect(this.mockEngine.update).toHaveBeenCalledWith(
                    User.collection,
                    id,
                    { updatedAt: model.updatedAt },
                    ['surname'],
                );
            });
    }

    public testUndefinedAttributes(): void {
        const model = new User({ contact: { phone: Faker.phone.phoneNumber() } });

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
        expect(model.hasAttribute('birthDate')).toBe(false);
        expect(model.getAttributes()).not.toHaveProperty('birthDate');
        expect(model.getAttributes(true)).toHaveProperty('birthDate');
    }

    public testSmartDirtyAttributesOnSetter(): void {
        const model = new User({
            name: Faker.name.firstName(),
            surname: Faker.name.lastName(),
            contact: { phone: Faker.phone.phoneNumber() },
        }, true);

        const originalSurname = model.surname;

        model.name = Faker.name.firstName();
        model.surname = Faker.name.lastName();
        model.surname = originalSurname;
        model.social = { twitter: Faker.internet.userName() };
        delete model.contact;

        expect(model.isDirty('name')).toBe(true);
        expect(model.isDirty('surname')).toBe(false);
        expect(model.isDirty('social')).toBe(true);
        expect(model.isDirty('contact')).toBe(true);
    }

    public testSmartDirtyAttributesOnUpdate(): void {
        const model = new User({
            id: Faker.random.uuid(),
            name: Faker.name.firstName(),
            surname: Faker.name.lastName(),
            contact: { phone: Faker.phone.phoneNumber() },
        }, true);

        this.mockEngine.create.mockReturnValue(Promise.resolve());

        model.update({
            name: Faker.name.firstName(),
            surname: model.surname,
            social: { twitter: Faker.internet.userName() },
            contact: undefined,
        });

        expect(this.mockEngine.update).toHaveBeenCalledTimes(1);
        expect(this.mockEngine.update).toHaveBeenCalledWith(
            User.collection,
            model.id,
            {
                name: model.name,
                social: model.social,
                updatedAt: model.updatedAt,
            },
            ['contact'],
        );
    }

}

import Faker from 'faker';

import SoukaiError from './SoukaiError';

describe('SoukaiError', () => {

    it('behaves like an error', () => {
        // Arrange
        const message = Faker.lorem.sentence();

        let error: SoukaiError | null = null;

        // Act
        try {
            throw new SoukaiError(message);
        } catch (e) {
            error = e;
        }

        // Assert
        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SoukaiError);
        expect(error!.name).toEqual('SoukaiError');
        expect(error!.message).toEqual(message);
        expect(error!.stack).not.toBeNull();
        expect(error!.stack).toContain('SoukaiError.test');
    });

    it('can be subclassed', () => {
        // Arrange
        class CustomSoukaiError extends SoukaiError {

            constructor(m: string) {
                super(`Custom message: ${m}`);
            }

        }

        const message = Faker.lorem.sentence();

        let error: CustomSoukaiError | null = null;

        // Act
        try {
            throw new CustomSoukaiError(message);
        } catch (e) {
            error = e;
        }

        // Assert
        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(SoukaiError);
        expect(error).toBeInstanceOf(CustomSoukaiError);
        expect(error!.name).toEqual('CustomSoukaiError');
        expect(error!.message).toEqual(`Custom message: ${message}`);
        expect(error!.stack).not.toBeNull();
        expect(error!.stack).toContain('SoukaiError.test');
    });

});

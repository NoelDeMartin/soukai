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

        const soukaiError = error as SoukaiError;
        expect(soukaiError.name).toEqual('SoukaiError');
        expect(soukaiError.message).toEqual(message);
        expect(soukaiError.stack).not.toBeNull();
        expect(soukaiError.stack).toContain('SoukaiError.test');
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

        const customSoukaiError = error as CustomSoukaiError;
        expect(customSoukaiError.name).toEqual('CustomSoukaiError');
        expect(customSoukaiError.message).toEqual(`Custom message: ${message}`);
        expect(customSoukaiError.stack).not.toBeNull();
        expect(customSoukaiError.stack).toContain('SoukaiError.test');
    });

});

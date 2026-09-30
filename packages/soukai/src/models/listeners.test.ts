import { InMemoryEngine, setEngine } from 'soukai/engines';
import { bootModels } from 'soukai/models';
import { emitModelEvent } from 'soukai/models/listeners';
import { Model } from 'soukai/models/Model';
import { describe, expect, it } from 'vite-plus/test';

describe('Model listeners', () => {
    it('prevents circular calls', async () => {
        // Arrange
        let count = 0;

        class A extends Model {
            public static boot(name?: string): void {
                super.boot(name);

                B.on('updated', (model) => {
                    count++;

                    return model.a && emitModelEvent(model.a, 'updated');
                });
            }

            public b?: B;
        }

        class B extends Model {
            public static boot(name?: string): void {
                super.boot(name);

                A.on('updated', (model) => {
                    count++;

                    return model.b && emitModelEvent(model.b, 'updated');
                });
            }

            public a?: A;
        }

        bootModels({ A, B });
        setEngine(new InMemoryEngine());

        // Act
        const a = await A.create();
        const b = await B.create();

        a.b = a;
        b.a = a;

        await a.update({ name: 'A' });

        // Assert
        expect(count).toBe(1);
    });
});

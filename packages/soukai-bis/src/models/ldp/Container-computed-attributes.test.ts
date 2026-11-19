import SoukaiError from 'soukai-bis/errors/SoukaiError';
import ComputedAttribute from 'soukai-bis/models/computed-attributes/ComputedAttribute';
import Gallery from 'soukai-bis/models/ldp/testing/stubs/Gallery';
import { engine } from 'soukai-bis/testing/utils/engines';
import { beforeEach, describe, expect, it } from 'vite-plus/test';

describe('Container computed attributes', () => {
    const containerUrl = 'https://alice.example/galleries/holidays/';

    beforeEach(() => {
        ComputedAttribute.enableLoadingRelations();
    });

    it('refreshes computed attributes after uploading files to related containers', async () => {
        // Arrange
        const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });
        const imageUrls = gallery.getComputedAttribute('imageUrls');

        await gallery.loadRelation('container');
        await imageUrls.updateValue();

        // Act
        await gallery.relatedContainer.uploadFile(new Blob(['beach'], { type: 'image/png' }), {
            slug: 'beach.png',
        });

        // Assert
        expect(imageUrls.value).toEqual([`${containerUrl}beach.png`]);
        expect(gallery.container?.fileUrls).toEqual([`${containerUrl}beach.png`]);
    });

    it('does not upload files to related containers of models that do not exist', async () => {
        // Arrange
        const gallery = new Gallery({ url: `${containerUrl}index#it`, name: 'Holidays' });

        // Act
        const upload = gallery.relatedContainer.uploadFile(new Blob(['beach']), { slug: 'beach.png' });

        // Assert
        await expect(upload).rejects.toThrow(SoukaiError);
        expect(await engine.getFile(`${containerUrl}beach.png`)).toBeNull();
    });

    it('does not upload files to related containers before loading them', async () => {
        // Arrange
        const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });

        // Act
        const upload = gallery.relatedContainer.uploadFile(new Blob(['beach']), { slug: 'beach.png' });

        // Assert
        await expect(upload).rejects.toThrow(SoukaiError);
        expect(await engine.getFile(`${containerUrl}beach.png`)).toBeNull();
    });

    it('refreshes computed attributes after deleting files from loaded related containers', async () => {
        // Arrange
        const gallery = await Gallery.create({ url: `${containerUrl}index#it`, name: 'Holidays' });
        const imageUrls = gallery.getComputedAttribute('imageUrls');

        await engine.writeFile(`${containerUrl}beach.png`, new Blob(['beach'], { type: 'image/png' }));
        await engine.writeFile(`${containerUrl}mountain.png`, new Blob(['mountain'], { type: 'image/png' }));
        await gallery.loadRelation('container');
        await imageUrls.updateValue();

        // Act
        await gallery.relatedContainer.deleteFile(`${containerUrl}beach.png`);

        // Assert
        expect(imageUrls.value).toEqual([`${containerUrl}mountain.png`]);
        expect(gallery.container?.fileUrls).toEqual([`${containerUrl}mountain.png`]);
    });
});

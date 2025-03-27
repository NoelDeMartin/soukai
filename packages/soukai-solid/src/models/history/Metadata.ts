import Model from './Metadata.schema';

export default class Metadata extends Model {

    public getCreatedAtAttribute(): Date {
        return this.getAttributeValue('createdAt');
    }

    public getUpdatedAtAttribute(): Date {
        return this.getAttributeValue('updatedAt');
    }

    protected newUrl(documentUrl?: string, resourceHash?: string): string {
        if (!this.resourceUrl) {
            return super.newUrl(documentUrl, resourceHash);
        }

        return this.resourceUrl.includes('#') ? `${this.resourceUrl}-metadata` : `${this.resourceUrl}#metadata`;
    }

}

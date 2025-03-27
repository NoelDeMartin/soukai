import { uuid } from '@noeldemartin/utils';

import type { SolidModel } from 'soukai-solid/models/SolidModel';

import Model from './Operation.schema';

export default class Operation extends Model {

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public apply(model: SolidModel): void {
        //
    }

    public isInception(parent: SolidModel): boolean {
        return parent.metadata?.createdAt?.getTime() === this.date.getTime();
    }

    protected newUrl(documentUrl?: string, resourceHash?: string): string {
        if (!this.resourceUrl) {
            return super.newUrl(documentUrl, resourceHash);
        }

        const hashSuffix = resourceHash ?? uuid();

        return this.resourceUrl.includes('#')
            ? `${this.resourceUrl}-operation-${hashSuffix}`
            : `${this.resourceUrl}#operation-${hashSuffix}`;
    }

}

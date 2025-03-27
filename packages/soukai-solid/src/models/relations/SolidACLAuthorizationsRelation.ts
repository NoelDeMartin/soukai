import { fetchSolidDocumentACL, quadsToJsonLD } from '@noeldemartin/solid-utils';
import { fail } from '@noeldemartin/utils';
import { MultiModelRelation, requireBootedModel } from 'soukai';
import type { EngineDocument } from 'soukai';

import type SolidACLAuthorization from 'soukai-solid/models/SolidACLAuthorization';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export default class SolidACLAuthorizationsRelation<Parent extends SolidModel = SolidModel> extends MultiModelRelation<
    Parent,
    SolidACLAuthorization,
    typeof SolidACLAuthorization
> {

    declare public aclUrl: string | undefined;
    declare public effectiveACLUrl: string | undefined;

    constructor(parent: Parent) {
        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');

        super(parent, aclAuthorizationClass);
    }

    public requireACLUrl(): string {
        return this.aclUrl ?? fail('Could not get ACL Url');
    }

    public isDocumentACL(): boolean | null {
        if (!this.aclUrl || !this.effectiveACLUrl) return null;

        return this.aclUrl === this.effectiveACLUrl;
    }

    public setForeignAttributes(): void {
        // nothing to do here
    }

    public async load(): Promise<SolidACLAuthorization[]> {
        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');
        const acl = await fetchSolidDocumentACL(this.parent.requireDocumentUrl(), aclAuthorizationClass.requireFetch());
        const jsonld = await quadsToJsonLD(acl.document.statements());
        const authorizations = await Promise.all(
            acl.document
                .statements(undefined, 'rdf:type', 'acl:Authorization')
                .map(({ subject }) =>
                    aclAuthorizationClass.createFromEngineDocument(
                        acl.effectiveUrl,
                        jsonld as EngineDocument,
                        subject.value,
                    )),
        );

        this.aclUrl = acl.url;
        this.effectiveACLUrl = acl.effectiveUrl;
        this.related = authorizations;

        return authorizations;
    }

}

import { arrayWithout, tap, urlParse, uuid } from '@noeldemartin/utils';
import { SolidDocument, SolidDocumentPermission, expandIRI } from '@noeldemartin/solid-utils';
import { requireBootedModel } from 'soukai';

import type { SolidEngine } from 'soukai-solid/engines/SolidEngine';
import type SolidACLAuthorization from 'soukai-solid/models/SolidACLAuthorization';
import type { SolidModel } from 'soukai-solid/models/SolidModel';

export interface PermissionsTracker {
    documentPermissions: Record<string, SolidDocumentPermission[]>;
    stopTracking(): void;
}

export type This = SolidModel;

export default class ManagesPermissions {

    declare protected _publicPermissions: SolidDocumentPermission[] | undefined;

    public get isPublic(): boolean | null {
        return this._publicPermissions?.includes(SolidDocumentPermission.Read) ?? null;
    }

    public get isPrivate(): boolean | null {
        return this._publicPermissions ? !this._publicPermissions.includes(SolidDocumentPermission.Read) : null;
    }

    public async fetchPublicPermissionsIfMissing(this: This): Promise<void> {
        if (this._publicPermissions) return;

        await this.fetchPublicPermissions();
    }

    public async fetchPublicPermissions(this: This): Promise<void> {
        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');
        const documentUrl = this.requireDocumentUrl();
        const fetch = aclAuthorizationClass.requireFetch();
        const resourceHead = await fetch(documentUrl, { method: 'HEAD' });
        const document = new SolidDocument(documentUrl, [], resourceHead.headers);

        this._publicPermissions = document.getPublicPermissions();
    }

    public async updatePublicPermissions(this: This, permissions: SolidDocumentPermission[]): Promise<void> {
        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');

        await this.withEngine(aclAuthorizationClass.requireEngine(), () => this.updateAuthorizations(permissions));

        this._publicPermissions = permissions;
    }

    protected trackPublicPermissions(this: This): PermissionsTracker {
        if (!this.static().usingSolidEngine()) {
            return {
                documentPermissions: {},
                stopTracking() {
                    //
                },
            };
        }

        const documentPermissions: Record<string, SolidDocumentPermission[]> = {};
        const stopTracking = this.static()
            .requireFinalEngine<SolidEngine>()
            .listeners.add({
                onDocumentRead(url, metadata) {
                    if (!metadata.headers) {
                        return;
                    }

                    const document = new SolidDocument(url, [], metadata.headers);

                    documentPermissions[url] = document.getPublicPermissions();
                },
            });

        return { documentPermissions, stopTracking };
    }

    private async updateAuthorizations(this: This, permissions: SolidDocumentPermission[]): Promise<void> {
        this.relatedAuthorizations.enable();

        const authorizations = await this.loadRelationIfUnloaded<SolidACLAuthorization[]>('authorizations');
        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');
        const modes = permissions.map((permission) =>
            aclAuthorizationClass.modeFromSolidDocumentPermission(permission));
        const publicAuthorizations = authorizations.filter((authorization) =>
            authorization.agentClasses.includes(expandIRI('foaf:Agent')));
        const publicModes = publicAuthorizations.map((authorization) => authorization.modes).flat();

        if (modes.length === publicModes.length && !modes.some((mode) => publicModes.includes(mode))) return;

        if (!this.relatedAuthorizations.isDocumentACL()) {
            await this.createDocumentACLResource(modes);

            return;
        }

        if (modes.length === 0) {
            for (const authorization of publicAuthorizations) {
                await authorization.delete();
            }

            this.relatedAuthorizations.related = arrayWithout(authorizations, publicAuthorizations);

            return;
        }

        if (publicAuthorizations.length === 0) {
            await this.createPublicAuthorization(modes);

            return;
        }

        for (const authorization of publicAuthorizations) {
            await authorization.update({ modes });
        }
    }

    private async createDocumentACLResource(this: This, publicModes: string[]): Promise<void> {
        this.relatedAuthorizations.enable();

        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');
        const authorizations = this.authorizations as SolidACLAuthorization[];
        const ownerAuthorizations = authorizations
            .filter((authorization) => authorization.modes.includes(aclAuthorizationClass.rdfTerm('acl:Control')))
            .map((authorization) =>
                tap(new aclAuthorizationClass(authorization.getAttributes()), (newAuthorization) => {
                    newAuthorization.accessTo = [this.requireDocumentUrl()];
                    newAuthorization.accessToClasses = [];
                    newAuthorization.default = [];
                    newAuthorization.mintUrl(
                        this.relatedAuthorizations.requireACLUrl(),
                        false,
                        urlParse(authorization.url)?.fragment ?? uuid(),
                    );
                }));

        for (const authorization of ownerAuthorizations) {
            await authorization.save();
        }

        this.relatedAuthorizations.related = ownerAuthorizations;
        this.relatedAuthorizations.effectiveACLUrl = this.relatedAuthorizations.aclUrl;

        await this.createPublicAuthorization(publicModes);
    }

    private async createPublicAuthorization(this: This, modes: string[]): Promise<void> {
        this.relatedAuthorizations.enable();

        const aclAuthorizationClass = requireBootedModel<typeof SolidACLAuthorization>('SolidACLAuthorization');
        const publicAuthorization = await aclAuthorizationClass.createInDocument(
            {
                agentClasses: [aclAuthorizationClass.rdfTerm('foaf:Agent')],
                accessTo: [this.requireDocumentUrl()],
                modes,
            },
            this.relatedAuthorizations.requireACLUrl(),
            'public',
        );

        this.relatedAuthorizations.related?.push(publicAuthorization);
    }

}

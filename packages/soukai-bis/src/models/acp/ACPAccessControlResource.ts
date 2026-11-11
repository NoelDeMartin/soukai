import SoukaiError from 'soukai-bis/errors/SoukaiError';

import type ACPAccessControl from './ACPAccessControl';
import Model from './ACPAccessControlResource.schema';
import type ACPMatcher from './ACPMatcher';
import type ACPPolicy from './ACPPolicy';
import { isBlankNodeIRI } from './internals';

function isNamed(model: { url?: string }): boolean {
    return !!model.url && !isBlankNodeIRI(model.url);
}

function policyMatchers(policy: ACPPolicy): ACPMatcher[] {
    return [...(policy.allOfMatchers ?? []), ...(policy.anyOfMatchers ?? []), ...(policy.noneOfMatchers ?? [])];
}

function containsBlankNodeIRIs(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some(containsBlankNodeIRIs);
    }

    return typeof value === 'string' && URL.canParse(value) && isBlankNodeIRI(value);
}

export default class ACPAccessControlResource extends Model {
    public static remote = true;

    public removeAccessControl(accessControl: ACPAccessControl): void {
        if (!isNamed(accessControl)) {
            throw new SoukaiError(`Can't remove access control ${accessControl.url}, it's a blank node`);
        }

        const otherAccessControls = [...(this.accessControls ?? []), ...(this.memberAccessControls ?? [])].filter(
            (otherAccessControl) => otherAccessControl.url !== accessControl.url,
        );
        const otherPolicies = otherAccessControls.flatMap((otherAccessControl) => otherAccessControl.policies ?? []);
        const otherPolicyUrls = new Set(otherPolicies.map(({ url }) => url));
        const otherMatcherUrls = new Set(otherPolicies.flatMap(policyMatchers).map(({ url }) => url));
        const policies = accessControl.policies ?? [];
        const removedPolicies = policies.filter(
            (policy) => isNamed(policy) && policyMatchers(policy).every(isNamed) && !otherPolicyUrls.has(policy.url),
        );
        const removedMatchers = removedPolicies
            .flatMap(policyMatchers)
            .filter((matcher) => !otherMatcherUrls.has(matcher.url));
        const removedAccessControls = policies.every(isNamed) ? [accessControl] : [];

        this.relatedAccessControls.detach(accessControl);
        this.relatedMemberAccessControls.detach(accessControl);

        for (const model of [...removedAccessControls, ...removedPolicies, ...removedMatchers]) {
            model.markForDeletion();
        }
    }

    protected override async performSave(): Promise<void> {
        for (const model of this.getDirtyDocumentModels()) {
            const attributes = model.getAttributes() as Record<string, unknown>;
            const changesBlankNodes =
                (!!model.url && isBlankNodeIRI(model.url)) ||
                model.getDirtyAttributes().some((attribute) => containsBlankNodeIRIs(attributes[attribute]));

            if (changesBlankNodes) {
                throw new SoukaiError(
                    `Can't update ${model.url} in ${this.requireDocumentUrl()}, blank nodes are read-only`,
                );
            }
        }

        await super.performSave();
    }
}

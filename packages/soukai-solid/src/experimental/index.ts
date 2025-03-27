const experimental: ExperimentalFlags = {
    activityPods: false,
};

export interface ExperimentalFlags {
    activityPods: boolean;
}

export function getExperimentalFlag(flag: keyof ExperimentalFlags): boolean {
    return experimental[flag];
}

/**
 * Experimental features can be enabled or disabled using this function,
 * but they are unstable and they could be removed or modified without conforming
 * with Semantic Versioning.
 */
export function setExperimentalFlags(flags: Partial<ExperimentalFlags>): void {
    Object.assign(experimental, flags);
}

export function usingExperimentalActivityPods(): boolean {
    return getExperimentalFlag('activityPods');
}

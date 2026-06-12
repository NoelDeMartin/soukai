import ComputedAttributesCache from './ComputedAttributesCache';

export { computedProxy } from './proxies';
export { getComputedAttributeDependencies } from './dependencies';
export { default as ComputedAttribute } from './ComputedAttribute';
export { default as ComputedAttributesCache } from './ComputedAttributesCache';
export { default as ComputedAttributesRegistry } from './ComputedAttributesRegistry';

export type { ComputedProxy } from './proxies';

export async function clearCache(): Promise<void> {
    await ComputedAttributesCache.clear();
}

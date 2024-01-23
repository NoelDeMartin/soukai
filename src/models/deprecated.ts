/**
 * @deprecated Use ModelEvents keys instead.
 */
export const ModelEvent = {
    Created: 'created' as const,
    Deleted: 'deleted' as const,
    Updated: 'updated' as const,
};

/**
 * @deprecated Use ModelEvents keys instead.
 */
export type ModelEventValue = typeof ModelEvent[keyof typeof ModelEvent];

import type ChangeUrlOperation from './ChangeUrlOperation';
import type RemovePropertyOperation from './RemovePropertyOperation';
import type ShieldPropertyOperation from './ShieldPropertyOperation';
import type UpdatePropertyOperation from './UpdatePropertyOperation';

export type UpdateOperation =
    | UpdatePropertyOperation
    | RemovePropertyOperation
    | ShieldPropertyOperation
    | ChangeUrlOperation;

export const OperationTypes = {
    ChangeUrl: 'change',
    RemoveProperty: 'remove',
    ShieldProperty: 'shield',
    UpdateProperty: 'update',
} as const;

export type OperationType = (typeof OperationTypes)[keyof typeof OperationTypes];

export default interface Operation {
    type: OperationType;
}

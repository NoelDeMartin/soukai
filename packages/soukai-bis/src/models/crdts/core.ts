import RestoreOperation from './RestoreOperation';
import SetPropertyOperation from './SetPropertyOperation';
import SoftDeleteOperation from './SoftDeleteOperation';
import UnsetPropertyOperation from './UnsetPropertyOperation';

export const coreOperationModels = {
    RestoreOperation,
    SetPropertyOperation,
    SoftDeleteOperation,
    UnsetPropertyOperation,
};

declare module 'soukai-bis' {
    interface ModelsRegistry {
        RestoreOperation: typeof RestoreOperation;
        SetPropertyOperation: typeof SetPropertyOperation;
        SoftDeleteOperation: typeof SoftDeleteOperation;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}

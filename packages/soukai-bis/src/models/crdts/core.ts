import AddPropertyOperation from './AddPropertyOperation';
import RemovePropertyOperation from './RemovePropertyOperation';
import RestoreOperation from './RestoreOperation';
import SetPropertyOperation from './SetPropertyOperation';
import SoftDeleteOperation from './SoftDeleteOperation';
import UnsetPropertyOperation from './UnsetPropertyOperation';

export const coreOperationModels = {
    AddPropertyOperation,
    RemovePropertyOperation,
    RestoreOperation,
    SetPropertyOperation,
    SoftDeleteOperation,
    UnsetPropertyOperation,
};

declare module 'soukai-bis' {
    interface ModelsRegistry {
        AddPropertyOperation: typeof AddPropertyOperation;
        RemovePropertyOperation: typeof RemovePropertyOperation;
        RestoreOperation: typeof RestoreOperation;
        SetPropertyOperation: typeof SetPropertyOperation;
        SoftDeleteOperation: typeof SoftDeleteOperation;
        UnsetPropertyOperation: typeof UnsetPropertyOperation;
    }
}

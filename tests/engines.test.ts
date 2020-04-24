import EngineHelperTests from './lib/suites/EngineHelperTests';
import IndexedDBEngineTests from './lib/suites/IndexedDBEngineTests';
import InMemoryEngineTests from './lib/suites/InMemoryEngineTests';
import LocalStorageEngineTests from './lib/suites/LocalStorageEngineTests';

EngineHelperTests.run();
IndexedDBEngineTests.run();
InMemoryEngineTests.run();
LocalStorageEngineTests.run();

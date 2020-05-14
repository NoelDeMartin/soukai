import IndexedDBEngineTests from './lib/suites/IndexedDBEngineTests';
import InMemoryEngineTests from './lib/suites/InMemoryEngineTests';
import LocalStorageEngineTests from './lib/suites/LocalStorageEngineTests';

IndexedDBEngineTests.run();
InMemoryEngineTests.run();
LocalStorageEngineTests.run();

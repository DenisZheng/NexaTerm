# SQLite initialization write admission

## 1. Scope / trigger

Full Windows application CI exposed SQLITE_BUSY in the existing concurrent v2 upgrade test, during the initial schema batch. Initialization performs DDL and must enter as a writer, rather than relying on implicit read-to-write promotion. This does not change the schema/version, lock timeout, error policy or enable retries.

## 2. Signatures

`SqliteStore::initialize(&self) -> Result<(),AppError>` starts a rusqlite Transaction with TransactionBehavior::Immediate for the newer-schema check and SCHEMA_SQL batch, commits it, then runs the existing backup/group/protocol migrations. VACUUM INTO and FK mode changes remain outside this transaction.

## 3. Contracts

Acquire the actual SQLite write lock before schema inspection/DDL, using the existing5000ms busy timeout. Reject newer schema under that lock before modifications. Initial DDL is atomic: failure rolls back the whole batch, preserves pre-existing tables/data and leaves autocommit restored. Do not hold a deferred reader snapshot while trying to upgrade to a writer. No process-global mutex, increased timeout, catch-and-ignore BUSY, broad retry or test serialization.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Write admission / DDL / commit error | fixed sqlite_store_init_failed; no successful partial initialization |
| Newer schema | existing connection_group_migration_failed before DDL |
| Group backup/migration error | existing migration failure and FK restoration contracts |

## 5. Cases

Good: four concurrent initializers enter the DDL phase serially and all complete the existing migration. Base: repeat initialization is idempotent. Bad: issue a long implicit CREATE batch under concurrent schema changes or assume busy_timeout can make a stale read snapshot writable.

## 6. Required tests

Barrier-start real concurrent v2 upgrades, preserving rows and final schema; incompatible existing table causes a later DDL error and proves earlier newly-created tables were rolled back, original data remains, autocommit restored. Keep existing idempotence/newer-schema/backup/rollback and three-platform full application gates.

## 7. Wrong vs correct

Wrong: increase the busy timeout or retry all SQLite errors. Correct: establish write ownership before inspection and DDL, propagate failures and test real rollback. Official rationale: SQLite [transactions](https://www.sqlite.org/lang_transaction.html) and [isolation](https://www.sqlite.org/isolation.html); the precise extended BUSY subtype was not retained in the old failure log, so do not claim a measured BUSY_SNAPSHOT code.

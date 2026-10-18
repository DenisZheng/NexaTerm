//! 仅保存独立Rlogin配置；备份、schema和版本完成前不报告升级成功。
use std::fs::{self,File,OpenOptions};
use rusqlite::{Connection,OptionalExtension,Transaction,TransactionBehavior};
use crate::app_error::AppError;
const VERSION:i64=5;
fn failure(phase:&str,error:impl ToString)->AppError {
    AppError::new("rlogin_config_migration_failed","Rlogin 配置存储升级失败，原数据已保留。",format!("{phase}: {}",error.to_string()),true)
}
fn version(db:&Connection)->Result<i64,AppError> {
    db.query_row("SELECT MAX(version) FROM schema_migrations",[],|r|r.get::<_,Option<i64>>(0))
        .map(|v|v.unwrap_or(0)).map_err(|e|failure("version",e))
}
fn column(db:&Connection)->Result<bool,AppError> {
    let kind=db.query_row("SELECT type FROM pragma_table_info('connections') WHERE name='rlogin_json'",[],|r|r.get::<_,String>(0))
        .optional().map_err(|e|failure("column",e))?;
    match kind {None=>Ok(false),Some(kind) if kind.eq_ignore_ascii_case("TEXT")=>Ok(true),Some(_)=>Err(failure("column","unexpected column affinity"))}
}
fn migration_lock(db:&Connection)->Result<Option<File>,AppError> {
    let Some(path)=db.path().filter(|p|!p.is_empty()) else {return Ok(None);};
    let path=fs::canonicalize(path).map_err(|e|failure("lock_path",e))?;
    let mut lock_path=path.into_os_string();lock_path.push(".wf09-rlogin-schema.lock");
    let lock=OpenOptions::new().create(true).truncate(false).read(true).write(true).open(lock_path).map_err(|e|failure("lock_open",e))?;
    lock.lock().map_err(|e|failure("lock",e))?;Ok(Some(lock))
}
pub(crate) fn migrate(db:&Connection,backup_existing:bool)->Result<(),AppError> {
    let _migration_lock=migration_lock(db)?;
    let previous=version(db)?;
    if previous>VERSION {return Err(failure("version","newer schema"));}
    if previous==VERSION {
        return if column(db)? {Ok(())} else {Err(failure("column","missing current column"))};
    }
    if backup_existing {
        if let Some(path)=db.path().filter(|p|!p.is_empty()) {
            let backup=format!("{path}.wf09-rlogin-v{previous}-{}.bak",uuid::Uuid::new_v4());
            db.execute("VACUUM INTO ?1",[backup]).map_err(|e|failure("backup",e))?;
        }
    }
    let tx=Transaction::new_unchecked(db,TransactionBehavior::Immediate).map_err(|e|failure("begin",e))?;
    let current=version(&tx)?;
    if current>VERSION {return Err(failure("version","newer schema"));}
    if !column(&tx)? {
        if current==VERSION {return Err(failure("column","missing current column"));}
        tx.execute("ALTER TABLE connections ADD COLUMN rlogin_json TEXT",[]).map_err(|e|failure("alter",e))?;
    }
    tx.execute("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(5,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",[])
        .map_err(|e|failure("record",e))?;
    tx.commit().map_err(|e|failure("commit",e))
}

#[cfg(test)] mod tests {
    use super::*;
    use std::{path::PathBuf,sync::{Arc,Barrier},time::Duration};
    fn database()->(Connection,PathBuf) {
        let root=std::env::temp_dir().join(format!("rlogin-schema-{}",uuid::Uuid::new_v4()));fs::create_dir(&root).unwrap();
        let db=Connection::open(root.join("store.db")).unwrap();
        db.busy_timeout(Duration::from_secs(5)).unwrap();db.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
            INSERT INTO schema_migrations VALUES(4,'before');
            CREATE TABLE connections(id TEXT PRIMARY KEY,name TEXT);
            INSERT INTO connections VALUES('old','preserved');").unwrap();(db,root)
    }
    fn backups(root:&std::path::Path)->Vec<PathBuf> {
        fs::read_dir(root).unwrap().map(|e|e.unwrap().path()).filter(|p|p.extension().is_some_and(|e|e=="bak")).collect()
    }
    #[test] fn upgrade_preserves_rows_and_a_consistent_previous_backup_and_is_idempotent() {
        let (db,root)=database();migrate(&db,true).unwrap();migrate(&db,true).unwrap();
        assert_eq!(version(&db).unwrap(),5);assert!(column(&db).unwrap());
        assert_eq!(db.query_row("SELECT name,rlogin_json FROM connections WHERE id='old'",[],|r|Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?))).unwrap(),("preserved".into(),None));
        let copies=backups(&root);assert_eq!(copies.len(),1);let previous=Connection::open(&copies[0]).unwrap();
        assert_eq!(version(&previous).unwrap(),4);assert!(!column(&previous).unwrap());
        assert_eq!(previous.query_row("SELECT name FROM connections",[],|r|r.get::<_,String>(0)).unwrap(),"preserved");
        drop(previous);drop(db);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn failed_version_record_rolls_back_column_and_retains_backup_for_retry() {
        let (db,root)=database();db.execute_batch("CREATE TRIGGER refuse_version BEFORE INSERT ON schema_migrations WHEN NEW.version=5 BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
        assert_eq!(migrate(&db,true).unwrap_err().code,"rlogin_config_migration_failed");
        assert!(db.is_autocommit());assert!(!column(&db).unwrap());assert_eq!(version(&db).unwrap(),4);assert_eq!(backups(&root).len(),1);
        db.execute_batch("DROP TRIGGER refuse_version").unwrap();migrate(&db,true).unwrap();assert_eq!(backups(&root).len(),2);
        drop(db);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn concurrent_upgrade_backups_once_and_never_overwrites_the_original() {
        let (db,root)=database();drop(db);let barrier=Arc::new(Barrier::new(4));
        let threads:Vec<_>=(0..4).map(|_| {let path=root.join("store.db");let barrier=barrier.clone();std::thread::spawn(move|| {
            let db=Connection::open(path).unwrap();db.busy_timeout(Duration::from_secs(5)).unwrap();barrier.wait();migrate(&db,true).unwrap();
        })}).collect();for thread in threads {thread.join().unwrap();}
        assert_eq!(backups(&root).len(),1);let db=Connection::open(root.join("store.db")).unwrap();assert_eq!(version(&db).unwrap(),5);
        drop(db);fs::remove_dir_all(root).unwrap();
    }
    #[test] fn unavailable_lock_and_newer_schema_fail_without_mutation() {
        let (db,root)=database();let lock=root.join("store.db.wf09-rlogin-schema.lock");fs::create_dir(&lock).unwrap();
        assert_eq!(migrate(&db,true).unwrap_err().code,"rlogin_config_migration_failed");assert_eq!(version(&db).unwrap(),4);assert!(!column(&db).unwrap());
        fs::remove_dir(lock).unwrap();db.execute("INSERT INTO schema_migrations VALUES(6,'future')",[]).unwrap();
        assert_eq!(migrate(&db,true).unwrap_err().code,"rlogin_config_migration_failed");assert_eq!(backups(&root).len(),0);assert!(!column(&db).unwrap());
        drop(db);fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn actual_store_initialization_skips_fresh_backups_then_upgrades_v4_once() {
        let root=std::env::temp_dir().join(format!("rlogin-store-schema-{}",uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let path=root.join("store.db");
        let store=crate::storage_sqlite::SqliteStore::open(&path).unwrap();
        store.initialize().unwrap();store.initialize().unwrap();
        assert_eq!(store.schema_version().unwrap(),5);
        assert!(backups(&root).is_empty());drop(store);
        let db=Connection::open(&path).unwrap();
        db.execute_batch("ALTER TABLE connections DROP COLUMN rlogin_json;
            DELETE FROM schema_migrations WHERE version>=4;
            INSERT INTO schema_migrations VALUES(4,'before-rlogin');").unwrap();
        drop(db);
        let store=crate::storage_sqlite::SqliteStore::open(&path).unwrap();
        store.initialize().unwrap();store.initialize().unwrap();
        assert_eq!(store.schema_version().unwrap(),5);
        assert_eq!(backups(&root).len(),1);drop(store);
        let previous=Connection::open(&backups(&root)[0]).unwrap();
        assert_eq!(version(&previous).unwrap(),4);assert!(!column(&previous).unwrap());
        drop(previous);fs::remove_dir_all(root).unwrap();
    }

}

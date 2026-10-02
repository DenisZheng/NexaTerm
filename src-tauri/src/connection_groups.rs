//! 分组身份、树校验与事务边界；名称是显示属性，不是关联键。
use crate::{app_error::AppError, storage_repository::StorageRepository};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ConnectionGroup {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct GroupInput {
    pub id: Option<String>,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: String,
}

pub fn validate_tree(groups: &[ConnectionGroup]) -> Result<(), AppError> {
    let mut by_id = BTreeMap::new();
    let mut names = BTreeSet::new();
    for g in groups {
        if g.id.is_empty() || by_id.insert(g.id.as_str(), g).is_some() {
            return Err(group_error(
                "connection_group_invalid",
                "分组 ID 为空或重复",
            ));
        }
        if g.name.trim().is_empty() || g.name != g.name.trim() {
            return Err(group_error(
                "connection_group_invalid",
                "分组名不能为空或包含首尾空白",
            ));
        }
        if !names.insert((g.parent_id.as_deref(), g.name.as_str())) {
            return Err(group_error(
                "connection_group_name_conflict",
                "目标文件夹已有同名分组",
            ));
        }
    }
    for g in groups {
        let mut visited = BTreeSet::from([g.id.as_str()]);
        let mut parent = g.parent_id.as_deref();
        while let Some(id) = parent {
            if !visited.insert(id) {
                return Err(group_error(
                    "connection_group_cycle",
                    "不能移动到自己或自己的子组",
                ));
            }
            parent = by_id
                .get(id)
                .ok_or_else(|| group_error("connection_group_parent_missing", "目标父组不存在"))?
                .parent_id
                .as_deref();
        }
    }
    Ok(())
}

pub(crate) fn list(db: &Connection) -> Result<Vec<ConnectionGroup>, AppError> {
    let mut stmt = db.prepare("SELECT id,name,parent_id,sort_order,color,created_at,updated_at FROM connection_groups ORDER BY sort_order,created_at,id").map_err(sql_error)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ConnectionGroup {
                id: r.get(0)?,
                name: r.get(1)?,
                parent_id: r.get(2)?,
                sort_order: r.get(3)?,
                color: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })
        .map_err(sql_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(sql_error)
}

impl StorageRepository {
    pub fn connection_groups(&self) -> Result<Vec<ConnectionGroup>, AppError> {
        list(self.sqlite_connection())
    }

    pub fn save_connection_group(
        &self,
        input: &GroupInput,
        now: &str,
    ) -> Result<ConnectionGroup, AppError> {
        let db = self.sqlite_connection();
        let tx = db.unchecked_transaction().map_err(sql_error)?;
        // 在读树之前取得写锁，避免并发 rename/move 使用过时的祖先关系。
        tx.execute(
            "UPDATE connection_groups SET sort_order=sort_order WHERE 0",
            [],
        )
        .map_err(sql_error)?;
        let mut groups = list(&tx)?;
        let old = input
            .id
            .as_ref()
            .map(|id| {
                groups
                    .iter()
                    .find(|g| &g.id == id)
                    .cloned()
                    .ok_or_else(|| group_error("connection_group_missing", "分组不存在"))
            })
            .transpose()?;
        let order = if let Some(g) = old.as_ref().filter(|g| g.parent_id == input.parent_id) {
            g.sort_order
        } else {
            groups
                .iter()
                .filter(|g| g.parent_id == input.parent_id)
                .map(|g| g.sort_order)
                .max()
                .unwrap_or(-1)
                .checked_add(1)
                .ok_or_else(|| group_error("connection_group_invalid", "分组顺序超出范围"))?
        };
        let group = ConnectionGroup {
            id: old
                .as_ref()
                .map(|g| g.id.clone())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: input.name.trim().to_owned(),
            parent_id: input.parent_id.clone(),
            sort_order: order,
            color: input.color.clone(),
            created_at: old
                .as_ref()
                .map(|g| g.created_at.clone())
                .unwrap_or_else(|| now.to_owned()),
            updated_at: now.to_owned(),
        };
        groups.retain(|g| g.id != group.id);
        groups.push(group.clone());
        validate_tree(&groups)?;
        tx.execute("INSERT INTO connection_groups(id,name,parent_id,sort_order,color,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,sort_order=excluded.sort_order,color=excluded.color,updated_at=excluded.updated_at",
            params![group.id,group.name,group.parent_id,group.sort_order,group.color,group.created_at,group.updated_at]).map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
        Ok(group)
    }

    pub fn delete_connection_group(&self, id: &str) -> Result<(), AppError> {
        // parent CASCADE 删除组子树，connection FK SET NULL 保留所有连接。
        let tx = self
            .sqlite_connection()
            .unchecked_transaction()
            .map_err(sql_error)?;
        if tx
            .execute("DELETE FROM connection_groups WHERE id=?1", [id])
            .map_err(sql_error)?
            == 0
        {
            return Err(group_error("connection_group_missing", "分组不存在"));
        }
        tx.commit().map_err(sql_error)
    }

    pub fn assign_connection_group(
        &self,
        connection_id: &str,
        group_id: Option<&str>,
        now: &str,
    ) -> Result<(), AppError> {
        let changed = self
            .sqlite_connection()
            .execute(
                "UPDATE connections SET group_id=?1,updated_at=?2 WHERE id=?3",
                params![group_id, now, connection_id],
            )
            .map_err(sql_error)?;
        if changed == 0 {
            return Err(group_error(
                "connection_group_connection_missing",
                "连接不存在",
            ));
        }
        Ok(())
    }
}

pub(crate) fn group_error(code: &'static str, message: &str) -> AppError {
    AppError::new(code, message, message, true)
}
fn sql_error(error: rusqlite::Error) -> AppError {
    AppError::new(
        "connection_group_write_failed",
        "分组操作失败，数据未更改。",
        error,
        true,
    )
}

/// 旧 profile / JSON / 第三方导入入口只认识名称，歧义时不得选取任意行。
pub(crate) fn ensure_legacy_group(
    db: &Connection,
    name: &str,
    now: &str,
) -> Result<String, AppError> {
    let matches: Vec<_> = list(db)?.into_iter().filter(|g| g.name == name).collect();
    match matches.as_slice() {
        [group] => Ok(group.id.clone()),
        [] => {
            let id = uuid::Uuid::new_v4().to_string();
            db.execute(
                "INSERT INTO connection_groups(id,name,created_at,updated_at) VALUES(?1,?2,?3,?3)",
                params![id, name, now],
            )
            .map_err(sql_error)?;
            Ok(id)
        }
        _ => Err(group_error(
            "connection_group_ambiguous",
            "存在多个同名分组，请按路径选择目标分组",
        )),
    }
}

/// 04A-3 接通新格式前，旧格式不能静默剥离刚写入的树字段。
pub(crate) fn require_flat_transfer(db: &Connection) -> Result<(), AppError> {
    if list(db)?
        .iter()
        .any(|g| g.parent_id.is_some() || g.color != "#64748b")
    {
        return Err(group_error(
            "connection_group_transfer_upgrade_required",
            "当前传输格式尚不支持分组树，请完成版本升级后重试",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;

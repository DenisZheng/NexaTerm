//! 同步与文件导入共用的树校验、身份映射和父优先写入。
use crate::{
    app_error::AppError,
    connection_groups::{validate_tree, ConnectionGroup},
    sync_snapshot::SyncConnectionGroup,
};
use rusqlite::{params, Connection};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn canonical(group: &SyncConnectionGroup) -> ConnectionGroup {
    ConnectionGroup {
        id: group.id.clone(),
        name: group.name.clone(),
        parent_id: group.parent_id.clone(),
        color: group.color.clone(),
        sort_order: group.sort_order,
        created_at: group.created_at.clone(),
        updated_at: group.updated_at.clone(),
    }
}

pub(crate) fn exported(group: ConnectionGroup) -> SyncConnectionGroup {
    SyncConnectionGroup {
        id: group.id,
        name: group.name,
        parent_id: group.parent_id,
        color: group.color,
        sort_order: group.sort_order,
        created_at: group.created_at,
        updated_at: group.updated_at,
    }
}

pub(crate) fn validate(groups: &[SyncConnectionGroup], legacy: bool) -> Result<(), AppError> {
    if legacy
        && groups
            .iter()
            .any(|g| g.parent_id.is_some() || g.color != "#64748b")
    {
        return Err(error("旧格式不能承载树扩展字段"));
    }
    validate_tree(&groups.iter().map(canonical).collect::<Vec<_>>())
}

fn ordered(groups: &[ConnectionGroup]) -> Result<Vec<ConnectionGroup>, AppError> {
    validate_tree(groups)?;
    let mut remaining: Vec<_> = groups.to_vec();
    let mut result = Vec::with_capacity(groups.len());
    let mut seen = BTreeSet::new();
    while !remaining.is_empty() {
        let before = remaining.len();
        remaining.retain(|group| {
            if group.parent_id.as_ref().is_none_or(|id| seen.contains(id)) {
                seen.insert(group.id.clone());
                result.push(group.clone());
                false
            } else {
                true
            }
        });
        if before == remaining.len() {
            return Err(error("无法解析父分组顺序"));
        }
    }
    Ok(result)
}

pub(crate) struct MergePlan {
    pub groups: Vec<ConnectionGroup>,
    pub mapping: BTreeMap<String, String>,
    pub conflicts: usize,
}

/// skip/overwrite 共用身份规划；拒绝多义映射以及最终树中的环或同级冲突。
pub(crate) fn plan(
    local: &[ConnectionGroup],
    imported: &[SyncConnectionGroup],
    overwrite: bool,
) -> Result<MergePlan, AppError> {
    let mut groups = local.to_vec();
    let mut mapping = BTreeMap::new();
    let mut targets = BTreeSet::new();
    let mut conflicts = 0;
    for mut group in ordered(&imported.iter().map(canonical).collect::<Vec<_>>())? {
        let source_id = group.id.clone();
        group.parent_id = group
            .parent_id
            .as_ref()
            .map(|parent| {
                mapping
                    .get(parent)
                    .cloned()
                    .ok_or_else(|| error("父组映射缺失"))
            })
            .transpose()?;
        let by_id = groups.iter().position(|g| g.id == source_id);
        let by_name = groups
            .iter()
            .position(|g| g.parent_id == group.parent_id && g.name == group.name);
        if by_id.is_some() && by_name.is_some() && by_id != by_name {
            return Err(error("分组 ID 与同级名称分别命中不同对象，请先解决冲突"));
        }
        if let Some(index) = by_id.or(by_name) {
            conflicts += 1;
            group.id = groups[index].id.clone();
            if overwrite {
                group.created_at = groups[index].created_at.clone();
                groups[index] = group.clone();
            }
        } else {
            groups.push(group.clone());
        }
        if !targets.insert(group.id.clone()) {
            return Err(error("多个导入分组映射到同一对象，请先解决冲突"));
        }
        mapping.insert(source_id, group.id);
    }
    validate_tree(&groups)?;
    Ok(MergePlan {
        groups,
        mapping,
        conflicts,
    })
}

/// 调用者必须持有事务。保留组 ID/连接 FK，临时名称仅存在于未提交事务。
pub(crate) fn persist(db: &Connection, groups: &[ConnectionGroup]) -> Result<(), AppError> {
    let ordered = ordered(groups)?;
    let existing = crate::connection_groups::list(db)?;
    let mut names: BTreeSet<_> = groups
        .iter()
        .chain(existing.iter())
        .map(|g| g.name.clone())
        .collect();
    for group in &existing {
        let temporary = loop {
            let name = format!("wf04a-{}", uuid::Uuid::new_v4());
            if names.insert(name.clone()) {
                break name;
            }
        };
        db.execute(
            "UPDATE connection_groups SET name=?1,parent_id=NULL WHERE id=?2",
            params![temporary, group.id],
        )
        .map_err(error)?;
    }
    for group in ordered {
        db.execute("INSERT INTO connection_groups(id,name,parent_id,color,sort_order,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,color=excluded.color,sort_order=excluded.sort_order,updated_at=excluded.updated_at",
          params![group.id,group.name,group.parent_id,group.color,group.sort_order,group.created_at,group.updated_at]).map_err(error)?;
    }
    Ok(())
}

fn error(cause: impl ToString) -> AppError {
    AppError::new(
        "connection_transfer_invalid_data",
        "分组树导入失败，本地数据未变更。",
        cause,
        true,
    )
}

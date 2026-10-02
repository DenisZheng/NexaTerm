//! 旧 WebView 分组树的一次性迁移。原文备份与迁移报告仅作证据，不是第二份目录。
use crate::{
    app_error::AppError,
    connection_groups::{validate_tree, ConnectionGroup},
    storage_repository::StorageRepository,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::Path,
};

const MARKER: &str = "wf04a_legacy_groups_complete";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LegacyRow {
    pub id: String,
    pub name: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default, rename = "parentId")]
    pub parent_id: Option<String>,
}
fn default_color() -> String {
    "#64748b".into()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LegacyResolution {
    pub index: usize,
    pub name: String,
    pub parent_index: Option<usize>,
    pub target_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LegacyMapping {
    pub legacy_id: String,
    pub canonical_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LegacyReport {
    pub complete: bool,
    pub backup_path: String,
    pub issue: Option<String>,
    pub rows: Vec<LegacyRow>,
    pub mappings: Vec<LegacyMapping>,
    pub repairs: Vec<String>,
}

impl StorageRepository {
    pub fn migrate_legacy_groups(
        &self,
        raw: Option<&str>,
        resolutions: Option<&[LegacyResolution]>,
        now: &str,
    ) -> Result<LegacyReport, AppError> {
        let db = self.sqlite_connection();
        let tx = db.unchecked_transaction().map_err(error)?;
        tx.execute("UPDATE app_meta SET value=value WHERE key=?1", [MARKER])
            .map_err(error)?;
        let completed: Option<String> = tx
            .query_row("SELECT value FROM app_meta WHERE key=?1", [MARKER], |row| {
                row.get(0)
            })
            .optional()
            .map_err(error)?;
        if let Some(completed) = completed {
            return serde_json::from_str(&completed).map_err(error);
        }
        let raw = raw.unwrap_or("[]");
        if raw.len() > 16 * 1024 * 1024 {
            return Err(error("旧分组数据超过迁移大小限制，原文未修改"));
        }
        let backup_path = backup(&self.root_dir(), raw)?;
        let mut report = LegacyReport {
            complete: false,
            backup_path,
            issue: None,
            rows: Vec::new(),
            mappings: Vec::new(),
            repairs: Vec::new(),
        };
        report.rows = match serde_json::from_str::<Vec<LegacyRow>>(raw) {
            Ok(rows) if rows.len() <= 5000 => rows,
            Ok(_) => {
                report.issue = Some("旧分组数量超过迁移限制，原文已备份，请由维护者处理。".into());
                return Ok(report);
            }
            Err(_) => {
                report.issue =
                    Some("旧分组数据无法解析，原文已备份。请由维护者修复原数据后重试。".into());
                return Ok(report);
            }
        };
        let local = self.connection_groups()?;
        let groups = match plan(&local, &report.rows, resolutions, now, &mut report.repairs) {
            Ok((groups, mappings)) => {
                report.mappings = mappings;
                groups
            }
            Err(issue) => {
                report.issue = Some(issue);
                return Ok(report);
            }
        };
        if !report.rows.is_empty() {
            crate::connection_group_transfer::persist(&tx, &groups)?;
        }
        report.complete = true;
        tx.execute(
            "INSERT INTO app_meta(key,value,updated_at) VALUES(?1,?2,?3)",
            params![MARKER, serde_json::to_string(&report).map_err(error)?, now],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(report)
    }
}

fn plan(
    local: &[ConnectionGroup],
    rows: &[LegacyRow],
    resolutions: Option<&[LegacyResolution]>,
    now: &str,
    repairs: &mut Vec<String>,
) -> Result<(Vec<ConnectionGroup>, Vec<LegacyMapping>), String> {
    let mut parents = vec![None; rows.len()];
    let mut targets = Vec::with_capacity(rows.len());
    let mut names: Vec<_> = rows.iter().map(|r| r.name.trim().to_owned()).collect();
    if let Some(resolutions) = resolutions {
        if resolutions.len() != rows.len() {
            return Err("请为每个旧分组明确选择映射。".into());
        }
        let by_index: BTreeMap<_, _> = resolutions.iter().map(|r| (r.index, r)).collect();
        if by_index.len() != rows.len() {
            return Err("映射行重复。".into());
        }
        for index in 0..rows.len() {
            let resolution = by_index.get(&index).ok_or("映射行缺失。")?;
            if resolution.parent_index.is_some_and(|p| p >= rows.len()) {
                return Err("父分组映射不存在。".into());
            }
            parents[index] = resolution.parent_index;
            names[index] = resolution.name.trim().to_owned();
            if let Some(id) = &resolution.target_id {
                if !local.iter().any(|g| &g.id == id) {
                    return Err("选择的已有分组已不存在，请重新选择。".into());
                }
            }
            targets.push(
                resolution
                    .target_id
                    .clone()
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            );
        }
        repairs.push("使用维护者显式确认的逐行名称、父组和 ID 映射。".into());
    } else {
        let mut ids = BTreeMap::new();
        let mut unique_names = BTreeSet::new();
        for (i, row) in rows.iter().enumerate() {
            if row.id.is_empty()
                || ids.insert(row.id.as_str(), i).is_some()
                || !unique_names.insert(names[i].clone())
            {
                return Err("旧分组 ID 或名称有歧义，请逐行确认名称、父组和目标分组。".into());
            }
        }
        for (i, row) in rows.iter().enumerate() {
            if let Some(parent) = row.parent_id.as_deref().filter(|p| !p.is_empty()) {
                parents[i] = ids.get(parent).copied();
                if parents[i].is_none() {
                    repairs.push(format!("{}：父组不存在，已提升到根目录。", row.name));
                }
            }
            let by_id = local.iter().find(|g| g.id == row.id);
            let by_name: Vec<_> = local.iter().filter(|g| g.name == names[i]).collect();
            if by_id.is_some_and(|g| g.name != names[i])
                || by_name.len() > 1
                || by_id.is_some_and(|g| by_name.first().is_some_and(|n| n.id != g.id))
            {
                return Err("旧分组与现有目录存在多个匹配，请显式选择目标分组。".into());
            }
            targets.push(
                by_id
                    .or_else(|| by_name.first().copied())
                    .map(|g| g.id.clone())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            );
        }
        // 找到实际环上的重复节点再断边，不误提升仅挂在环下的正常子组。
        for i in 0..rows.len() {
            let mut seen = BTreeSet::new();
            let mut current = Some(i);
            while let Some(index) = current {
                if !seen.insert(index) {
                    parents[index] = None;
                    repairs.push(format!(
                        "{}：检测到循环父关系，已断开此父边并提升到根目录。",
                        rows[index].name
                    ));
                    break;
                }
                current = parents[index];
            }
        }
    }
    if targets.iter().collect::<BTreeSet<_>>().len() != targets.len() {
        return Err("多个旧分组不能映射到同一个现有分组。".into());
    }
    let mut groups = local.to_vec();
    let mut orders = BTreeMap::<Option<usize>, i64>::new();
    let mut mappings = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let parent_id = parents[index].map(|p| targets[p].clone());
        let order = orders.entry(parents[index]).or_default();
        let existing = groups.iter().position(|g| g.id == targets[index]);
        if resolutions.is_none()
            && existing
                .is_some_and(|i| groups[i].parent_id.is_some() && groups[i].parent_id != parent_id)
        {
            return Err("现有目录已有层级，迁移会改变其位置，请显式确认映射。".into());
        }
        if resolutions.is_none()
            && existing
                .is_some_and(|i| groups[i].color != "#64748b" && groups[i].color != row.color)
        {
            return Err("现有目录颜色与旧数据冲突，请显式确认映射。".into());
        }
        if names[index] != row.name {
            repairs.push(format!("{}：名称已去除首尾空白。", row.name));
        }
        let group = ConnectionGroup {
            id: targets[index].clone(),
            name: names[index].clone(),
            parent_id,
            color: row.color.clone(),
            sort_order: *order,
            created_at: existing
                .map(|i| groups[i].created_at.clone())
                .unwrap_or_else(|| now.into()),
            updated_at: now.into(),
        };
        *order += 1;
        if let Some(i) = existing {
            groups[i] = group;
        } else {
            groups.push(group);
        }
        mappings.push(LegacyMapping {
            legacy_id: row.id.clone(),
            canonical_id: targets[index].clone(),
        });
    }
    validate_tree(&groups).map_err(|e| e.message)?;
    Ok((groups, mappings))
}

fn backup(root: &Path, raw: &str) -> Result<String, AppError> {
    let path = root.join(format!(
        "legacy-groups-{}.json",
        crate::sync_snapshot::sha256_hex(raw.as_bytes())
    ));
    if path.exists() {
        if fs::read_to_string(&path).map_err(error)? != raw {
            return Err(error("旧分组备份校验失败，拒绝覆盖"));
        }
        return Ok(path.to_string_lossy().into_owned());
    }
    let temp = root.join(format!("legacy-groups-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(raw.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(error)?;
    Ok(path.to_string_lossy().into_owned())
}
fn error(cause: impl ToString) -> AppError {
    AppError::new(
        "connection_group_legacy_failed",
        "旧分组迁移未完成，原始数据保留，请重试或查看迁移报告。",
        cause,
        true,
    )
}

#[cfg(test)]
#[path = "connection_group_legacy_tests.rs"]
mod tests;

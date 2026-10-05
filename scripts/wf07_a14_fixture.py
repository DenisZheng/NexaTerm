"""Windows A14 离线坏项工具：只替换专用测试实例的快照引用，不删除 profile/凭据。"""
import argparse
import csv
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

MISSING_PREFIX = "a14-missing-profile:"


def change_reference(database: Path, profile_name: str, restore: bool = False) -> None:
    if not profile_name.startswith("A14-"):
        raise ValueError("只允许名称以 A14- 开头的专用测试 profile")
    database = database.resolve(strict=True)
    with closing(sqlite3.connect(database.as_uri() + "?mode=rw", uri=True)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        profiles = connection.execute(
            "SELECT id, protocol FROM connections WHERE name = ?", (profile_name,)
        ).fetchall()
        if len(profiles) != 1 or profiles[0][1] != "ssh":
            raise ValueError("必须存在唯一的同名 SSH 测试 profile")
        profile_id = profiles[0][0]
        missing_id = MISSING_PREFIX + profile_id
        if connection.execute("SELECT 1 FROM connections WHERE id = ?", (missing_id,)).fetchone():
            raise ValueError("缺失引用 ID 已存在，不能构造坏项")
        row = connection.execute(
            "SELECT current_json FROM workspace_snapshots WHERE slot = 1"
        ).fetchone()
        if not row or not row[0]:
            raise ValueError("没有已保存快照，请先构造工作区并等待保存后完全退出")
        snapshot = json.loads(row[0])
        if snapshot.get("version") != 1 or not isinstance(snapshot.get("instances"), list):
            raise ValueError("只支持 v1 工作区快照")
        old_id, new_id = (missing_id, profile_id) if restore else (profile_id, missing_id)
        matches = [item for item in snapshot["instances"] if item.get("kind") == "ssh"
                   and item.get("target") == {"kind": "profile", "profileId": old_id}]
        if len(matches) != 1:
            raise ValueError("快照中必须恰有一个匹配的测试实例；请勿重复 apply/restore")
        matches[0]["target"]["profileId"] = new_id
        connection.execute(
            "UPDATE workspace_snapshots SET backup_json = current_json, current_json = ?, updated_at = ? WHERE slot = 1",
            (json.dumps(snapshot, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
        )


def require_closed_windows_app() -> None:
    if sys.platform != "win32":
        raise RuntimeError("此 CLI 仅用于 Windows 人工 A14 验收")
    result = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq nexaterm.exe", "/FO", "CSV", "/NH"],
        check=True, capture_output=True, text=True, encoding="oem",
    )
    if any(row and row[0].lower() == "nexaterm.exe" for row in csv.reader(result.stdout.splitlines())):
        raise RuntimeError("NexaTerm 仍在运行；请先完全退出，避免与自动保存竞争")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("apply", "restore"))
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--profile-name", default="A14-missing")
    args = parser.parse_args()
    require_closed_windows_app()
    change_reference(args.database, args.profile_name, args.action == "restore")
    print(f"A14 {args.action}: 已更新一个快照引用；profile、凭据、逻辑实例 ID 和布局均保留")


if __name__ == "__main__":
    main()

"""init：初始化本机身份（写 `~/.taskledger/identity.json`，一台机器只一次）。

只做逻辑，不打印、不读 stdin；交互/机器读在 shell 层。
- `claim`：认领名册里已有的 uuid（连 name 一起复制，不输入）。
- `new`  ：新建 uuid（必须给 name）。
- 都不给且名册有人：返回候选列表，交给调用方去问用户。
"""

from __future__ import annotations

import json
import uuid as uuidlib
from pathlib import Path
from typing import Any

from .. import env
from ..core.identity import Identity, looks_like_uuid, normalize
from ..core.paths import OWNERS_REL, to_repo_rel
from ..errors import Fail


def _read_workers(repo: Path | None) -> dict[str, Any]:
    if repo is None:
        return {}
    try:
        raw = (repo / to_repo_rel(OWNERS_REL)).read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, ValueError):
        return {}
    return (data or {}).get("workers", {}) or {}


def init_identity(
    repo: Path | None, *, claim: str | None, new: bool, name: str
) -> dict[str, Any]:
    path = env.identity_file()
    existing = env.read_identity()
    if existing is not None:
        # 已初始化 = 幂等空转（与 release/claim/close 的重跑口径一致）：退 0、零写。
        # 只有「认领另一个 uuid」才是真冲突——换身份不归 init 管。
        if claim is None or normalize(claim) == existing.uuid:
            return {
                "already": True,
                "uuid": existing.uuid,
                "name": existing.name,
                "path": str(path),
            }
        raise Fail(
            f"这台机器已经是 {existing.uuid}（{path}），不能再认领 {claim.strip()}。\n"
            "  处理：要换身份请手动改该文件的 uuid；一台机器一个身份。"
        )

    workers = _read_workers(repo)
    if claim:
        key = normalize(claim)  # 名册键一律小写；--claim 抄来的大小写不影响
        # 认领目标必须是 uuid：老台账的键还可能是个邮箱 / 名字，认来会让整台机器
        # 拿非 uuid 当身份写进每一处（--owner 反倒拒收自己）
        if not looks_like_uuid(key):
            raise Fail(
                f"认领目标不是 uuid：{claim.strip()}\n"
                "  处理：老台账（身份键是邮箱 / 名字）请改走 `init --new --name=<名字>`；"
                "先把那本台账迁到 uuid 身份，再谈认领。"
            )
        record = workers.get(key)
        if record is None:
            raise Fail(
                f"名册里没有 uuid={claim}。\n"
                "  处理：不带参数跑一次 init 看可选用户，再 --claim 选一个。"
            )
        identity = Identity(uuid=key, name=str(record.get("name") or ""))
    elif workers and not new:
        return {
            "need_choose": True,
            "path": str(path),
            "options": [
                {"uuid": key, "name": str((rec or {}).get("name") or "")}
                for key, rec in workers.items()
            ],
        }
    else:
        if not name.strip():
            raise Fail("新建身份必须输入一个名字（--name=<名字>）。")
        identity = Identity(uuid=str(uuidlib.uuid4()), name=name.strip())

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"uuid": identity.uuid, "name": identity.name}
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {"uuid": identity.uuid, "name": identity.name, "path": str(path)}

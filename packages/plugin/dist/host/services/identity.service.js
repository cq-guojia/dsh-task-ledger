import { forgetOwner as runForget, logout as runLogout, readIdentity, switchIdentity as runSwitch, } from "../repositories/identity.repository.js";
import { readOwners } from "../repositories/ledger.repository.js";
export async function getIdentity() {
    return await readIdentity();
}
export async function switchIdentity(input) {
    return await runSwitch(input);
}
/**
 * 把某个人从**所有登记过他的台账**里摘掉（用户 2026-11-02 定的口径）：
 * 每本台账各删各的，分片里还有任务的那本不删、如实回报；历史记录与其他台账一概不动。
 * 名册里没有他的台账直接跳过（不是失败）。
 *
 * **清本机身份必须是最后一步**：删的是自己时，每本台账都跑一次 forget，若让 forget 顺手
 * 删 identity.json，先跑完的那本会让后面几本读不到身份（报「这台机器还没有初始化身份」）。
 * 所以 forget 一律带 --keep-identity，全部跑完之后才按需要 logout。
 */
export async function forgetOwner(workspaces, uuid) {
    const key = uuid.trim().toLowerCase();
    const removed = [];
    const kept = [];
    const failed = [];
    const listed = await Promise.allSettled(workspaces.map(readOwners));
    const targets = workspaces.filter((_workspace, index) => {
        const result = listed[index];
        if (result.status !== "fulfilled")
            return false;
        return result.value.owners.some((owner) => owner.uuid === key);
    });
    // 摘的是不是自己：只有「自己」才需要最后退出登录
    const me = await readIdentity().catch(() => ({ uuid: null, name: null }));
    const isSelf = me.uuid !== null && me.uuid === key;
    const outcomes = await Promise.allSettled(targets.map((workspace) => runForget(workspace.path, key)));
    outcomes.forEach((result, index) => {
        const workspace = targets[index];
        if (result.status === "rejected") {
            const reason = result.reason;
            failed.push({
                workspace: workspace.title,
                error: reason instanceof Error ? reason.message : String(reason),
            });
            return;
        }
        if (result.value.removed)
            removed.push(workspace.title);
        else
            kept.push({ workspace: workspace.title, tasks: result.value.tasks });
    });
    // **全部成功才退登录**（用户 2026-11-02 拍板）：只要有一本还留着人（kept）或报错（failed），
    // 本机身份就保住 —— 人还没从台账里清干净，机器先没了身份只会更乱。
    let signedOut = false;
    const allDone = removed.length > 0 && kept.length === 0 && failed.length === 0;
    if (isSelf && allDone) {
        const anchor = (targets[0] ?? workspaces[0])?.path;
        if (anchor === undefined) {
            failed.push({ workspace: me.name ?? key, error: "退出登录失败：没有可用的台账目录" });
        }
        else {
            try {
                await runLogout(anchor);
                signedOut = true;
            }
            catch (error) {
                failed.push({
                    workspace: me.name ?? key,
                    error: `退出登录失败：${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
    }
    return { removed, kept, failed, signedOut };
}
export async function getRoster(workspaces) {
    const settled = await Promise.allSettled(workspaces.map(readOwners));
    const rows = [];
    settled.forEach((result, index) => {
        if (result.status !== "fulfilled")
            return;
        const owners = result.value;
        rows.push({
            id: workspaces[index].id,
            title: workspaces[index].title,
            owners: owners.owners
                .filter((owner) => owner.uuid !== "")
                .map((owner) => ({ uuid: owner.uuid, name: owner.name })),
        });
    });
    return { workspaces: rows };
}

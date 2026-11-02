import { forgetOwner as runForget, readIdentity, switchIdentity as runSwitch, } from "../repositories/identity.repository.js";
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
    return { removed, kept, failed };
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

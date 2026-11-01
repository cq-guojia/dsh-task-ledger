import { readIdentity, switchIdentity as runSwitch, } from "../repositories/identity.repository.js";
import { readOwners } from "../repositories/ledger.repository.js";
export async function getIdentity() {
    return await readIdentity();
}
export async function switchIdentity(input) {
    return await runSwitch(input);
}
/**
 * 各工作区花名册。**读挂了的工作区直接跳过**——名册索引缺失（`owners.json` 还没被任何写命令建出来）
 * 与新仓库本来就没人是同一件事：引导页要把它当「这里没人，只能新建」，不能当成故障。
 */
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

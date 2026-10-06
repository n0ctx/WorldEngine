// 写卡助手工作区：把 read / create / update / edit / set_state / delete / find 分发到各类资源。
// 所有写入最终经 normalizeProposal → applyProposal 落库；这里只负责绑定会话。

import { readWorkspace, readWorkspaceMany } from './read.js';
import {
  createWorkspaceResources, updateWorkspaceResources, setWorkspaceStates, removeWorkspaceResources,
} from './write.js';
import { editWorkspaceResource } from './edit.js';
import { findWorkspaceResources } from './find.js';

export { CREATE_KINDS } from './write.js';
export { FIND_KINDS } from './find.js';

export function createWorkspace(context = {}) {
  const session = {
    worldId: context.worldId ?? null,
    characterId: context.characterId ?? null,
  };
  return {
    session,
    read: (rawRef, options) => readWorkspace(session, rawRef, options),
    readMany: (refs) => readWorkspaceMany(session, refs),
    create: (kind, data, world) => createWorkspaceResources(session, [{ kind, data }], world),
    createMany: (items, world) => createWorkspaceResources(session, items, world),
    update: (rawRef, data) => updateWorkspaceResources(session, [{ ref: rawRef, data }]),
    updateMany: (items) => updateWorkspaceResources(session, items),
    edit: (rawRef, field, oldText, newText) => editWorkspaceResource(session, rawRef, [{ field, old_text: oldText, new_text: newText }]),
    editMany: (rawRef, edits) => editWorkspaceResource(session, rawRef, edits),
    setState: (rawRef, values) => setWorkspaceStates(session, [{ ref: rawRef, values }]),
    setStateMany: (items) => setWorkspaceStates(session, items),
    remove: (rawRef) => removeWorkspaceResources(session, [rawRef]),
    removeMany: (refs) => removeWorkspaceResources(session, refs),
    find: (query, options) => findWorkspaceResources(session, query, options),
  };
}

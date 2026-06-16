/**
 * _state-field-factory.js — world / character / persona 状态字段 service 的公共骨架
 *
 * 三类状态字段的 create/get/list/update/delete/reorder 流程结构一致，差异只在于：
 *   - 底层 db.queries 模块（create/getById/list/update/delete/reorder）
 *   - 创建/删除/改默认值时对“状态值行”的副作用（fan-out 到 world / 各 character / 各 persona）
 *
 * 本工厂把骨架（调用 db、写日志、返回值）收口，差异通过 hooks 注入。各 service 文件改为薄代理。
 *
 * 被以下模块引用：
 *   world-state-fields.js
 *   character-state-fields.js
 *   persona-state-fields.js
 */

import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

/**
 * @param {object} cfg
 * @param {string} cfg.entity            日志前缀，如 'world_state_field'
 * @param {object} cfg.queries           db.queries 模块函数集
 * @param {Function} cfg.queries.create
 * @param {Function} cfg.queries.getById
 * @param {Function} cfg.queries.list
 * @param {Function} cfg.queries.update
 * @param {Function} cfg.queries.remove
 * @param {Function} cfg.queries.reorder
 * @param {(field:object, worldId:string)=>void} cfg.onCreate
 *        创建字段后初始化状态值行。
 * @param {(opts:{field:object, oldField:object|null, patch:object})=>void} cfg.onUpdateDefault
 *        当 patch 含 default_value 且 update 成功时调用，负责同步默认状态值。
 *        若实现需要旧字段，工厂会在调用 update 前抓取 oldField 传入。
 * @param {(field:object)=>void} cfg.onDelete
 *        删除字段前清理对应状态值行。
 * @param {boolean} [cfg.needsOldFieldOnUpdate=false]
 *        update 默认值时是否需要旧字段快照（persona 需要做 diff）。
 * @returns {{create, getById, list, update, remove, reorder}}
 */
export function createStateFieldService(cfg) {
  const { entity, queries, onCreate, onUpdateDefault, onDelete, needsOldFieldOnUpdate = false } = cfg;

  function create(worldId, data) {
    const field = queries.create(worldId, data);
    onCreate(field, worldId);
    log.info(`${entity}.create  ${formatMeta({ worldId, fieldId: field.id, fieldKey: field.field_key, type: field.type })}`);
    return field;
  }

  function update(id, patch) {
    const touchesDefault = Object.hasOwn(patch, 'default_value');
    const oldField = needsOldFieldOnUpdate && touchesDefault ? queries.getById(id) : null;
    const field = queries.update(id, patch);
    if (field && touchesDefault) {
      onUpdateDefault({ field, oldField, patch });
      log.info(`${entity}.update_default  ${formatMeta({ worldId: field.world_id, fieldId: field.id, fieldKey: field.field_key })}`);
    }
    return field;
  }

  function remove(id) {
    const field = queries.getById(id);
    if (field) onDelete(field);
    const result = queries.remove(id);
    if (field) {
      log.info(`${entity}.delete  ${formatMeta({ worldId: field.world_id, fieldId: id, fieldKey: field.field_key })}`);
    }
    return result;
  }

  return {
    create,
    update,
    remove,
    getById: (id) => queries.getById(id),
    list: (worldId) => queries.list(worldId),
    reorder: (worldId, orderedIds) => queries.reorder(worldId, orderedIds),
  };
}

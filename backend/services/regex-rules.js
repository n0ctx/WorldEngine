import {
  createRegexRule as dbCreate,
  getRegexRuleById as dbGetById,
  listRegexRules as dbList,
  updateRegexRule as dbUpdate,
  deleteRegexRule as dbDelete,
  reorderRegexRules as dbReorder,
} from '../db/queries/regex-rules.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

export function createRegexRule(data) {
  const rule = dbCreate(data);
  log.info(`regex_rule.create  ${formatMeta({ id: rule.id, name: rule.name, scope: rule.scope, mode: rule.mode, worldId: rule.world_id })}`);
  return rule;
}
export const getRegexRuleById = (id)           => dbGetById(id);
export const listRegexRules   = (filters)      => dbList(filters);
export function updateRegexRule(id, patch) {
  const rule = dbUpdate(id, patch);
  if (rule) {
    log.info(`regex_rule.update  ${formatMeta({ id, fields: Object.keys(patch) })}`);
  }
  return rule;
}
export function deleteRegexRule(id) {
  const result = dbDelete(id);
  log.info(`regex_rule.delete  ${formatMeta({ id })}`);
  return result;
}
export const reorderRegexRules = (items)       => dbReorder(items);

import {
  createRegexRule as dbCreate,
  getRegexRuleById as dbGetById,
  listRegexRules as dbList,
  updateRegexRule as dbUpdate,
  deleteRegexRule as dbDelete,
  reorderRegexRules as dbReorder,
} from '../db/queries/regex-rules.js';

export const createRegexRule  = (data)        => dbCreate(data);
export const getRegexRuleById = (id)           => dbGetById(id);
export const listRegexRules   = (filters)      => dbList(filters);
export const updateRegexRule  = (id, patch)    => dbUpdate(id, patch);
export const deleteRegexRule  = (id)           => dbDelete(id);
export const reorderRegexRules = (items)       => dbReorder(items);

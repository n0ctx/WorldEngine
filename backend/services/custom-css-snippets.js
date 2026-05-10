import {
  createCustomCssSnippet as dbCreate,
  getCustomCssSnippetById as dbGetById,
  listCustomCssSnippets as dbList,
  updateCustomCssSnippet as dbUpdate,
  deleteCustomCssSnippet as dbDelete,
  reorderCustomCssSnippets as dbReorder,
} from '../db/queries/custom-css-snippets.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

export function createCustomCssSnippet(data) {
  const snippet = dbCreate(data);
  log.info(`css_snippet.create  ${formatMeta({ id: snippet.id, name: snippet.name, mode: snippet.mode })}`);
  return snippet;
}
export const getCustomCssSnippetById = (id)           => dbGetById(id);
export const listCustomCssSnippets   = (mode)         => dbList(mode);
export function updateCustomCssSnippet(id, patch) {
  const snippet = dbUpdate(id, patch);
  if (snippet) {
    log.info(`css_snippet.update  ${formatMeta({ id, fields: Object.keys(patch) })}`);
  }
  return snippet;
}
export function deleteCustomCssSnippet(id) {
  const result = dbDelete(id);
  log.info(`css_snippet.delete  ${formatMeta({ id })}`);
  return result;
}
export const reorderCustomCssSnippets = (items)       => dbReorder(items);

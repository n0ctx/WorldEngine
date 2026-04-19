import {
  createCustomCssSnippet as dbCreate,
  getCustomCssSnippetById as dbGetById,
  listCustomCssSnippets as dbList,
  updateCustomCssSnippet as dbUpdate,
  deleteCustomCssSnippet as dbDelete,
  reorderCustomCssSnippets as dbReorder,
} from '../db/queries/custom-css-snippets.js';

export const createCustomCssSnippet  = (data)        => dbCreate(data);
export const getCustomCssSnippetById = (id)           => dbGetById(id);
export const listCustomCssSnippets   = (mode)         => dbList(mode);
export const updateCustomCssSnippet  = (id, patch)    => dbUpdate(id, patch);
export const deleteCustomCssSnippet  = (id)           => dbDelete(id);
export const reorderCustomCssSnippets = (items)       => dbReorder(items);

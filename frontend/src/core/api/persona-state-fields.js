import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('persona-state-fields');

export const {
  list: listPersonaStateFields,
  create: createPersonaStateField,
  update: updatePersonaStateField,
  delete: deletePersonaStateField,
  reorder: reorderPersonaStateFields,
} = api;

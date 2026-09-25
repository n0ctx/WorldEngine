import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('character-state-fields');

export const {
  list: listCharacterStateFields,
  create: createCharacterStateField,
  update: updateCharacterStateField,
  delete: deleteCharacterStateField,
  reorder: reorderCharacterStateFields,
} = api;

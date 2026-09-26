import { useState } from 'react';

export function useCreateDraftIdentity(isCreate, readCreateDraft) {
  // Restore before autosave effects run so an empty form cannot overwrite the saved draft.
  const [draft] = useState(() => (isCreate ? readCreateDraft() : {}));
  const [name, setName] = useState(draft.name ?? '');
  const [description, setDescription] = useState(draft.description ?? '');
  return { draft, name, setName, description, setDescription };
}

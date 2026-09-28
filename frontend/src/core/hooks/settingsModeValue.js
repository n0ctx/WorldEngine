export function modeValue(isWriting, chatValue, writingValue) {
  return isWriting ? writingValue : chatValue;
}

export function modePatch(isWriting, key, value, section) {
  const patch = section ? { [section]: { [key]: value } } : { [key]: value };
  return isWriting ? { writing: patch } : patch;
}

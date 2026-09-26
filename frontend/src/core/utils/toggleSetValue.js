export function toggleSetValue(setValue, value) {
  setValue((previous) => {
    const next = new Set(previous);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });
}

export function saveItemOrder(items, reorder) {
  const orderedItems = items.map((item, index) => ({ id: item.id, sort_order: index }));
  return reorder(orderedItems);
}

// Moving a slot one place in its list, as ▲ and ▼ do on the Meal Template
// form and the Meal form (data-model T5).

// One place up (-1) or one place down (1).
export type SlotMove = -1 | 1;

// The slots with the one at `index` moved one place by `move`. A slot already
// at the top or bottom stays put.
export function moveSlot<T>(slots: readonly T[], index: number, move: SlotMove): T[] {
  const target = index + move;
  if (target < 0 || target >= slots.length) return [...slots];
  const moved = [...slots];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

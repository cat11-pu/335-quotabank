// bank.js：配额池
export function borrowOf(loans, tenant) {
  for (const row of loans || []) {
    if (row[0] === tenant) return row[1];
  }
  return 0;
}

export function leftOf(pool, loans) {
  let used = 0;
  for (const row of loans || []) used += row[1];
  return pool - used;
}

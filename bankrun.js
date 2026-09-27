// bankrun.js：按处理预算处理并留账
import { borrowOf, leftOf } from "./bank.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function byTenant(a, b) {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

function bump(loans, tenant, delta) {
  for (const row of loans) {
    if (row[0] === tenant) { row[1] += delta; return; }
  }
  loans.push([tenant, delta]);
  loans.sort(byTenant);
}

function makeCtx(spec, state) {
  return {
    loans: (state.loans || []).map(function (row) { return [row[0], row[1]]; }).sort(byTenant),
    left: state.left,
    borrows: state.borrows || 0,
    roomCode: spec.room_error_code || "E_NO_ROOM",
    loanCode: spec.loan_error_code || "E_NO_LOAN"
  };
}

function applyOne(ctx, kind, tenant, amount) {
  if (kind === "borrow") {
    if (ctx.left < amount) fail(ctx.roomCode, "pool left " + ctx.left + " < " + amount);
    ctx.left -= amount;
    bump(ctx.loans, tenant, amount);
    ctx.borrows += 1;
  } else {
    if (borrowOf(ctx.loans, tenant) < amount) fail(ctx.loanCode, "tenant " + tenant + " owes less than " + amount);
    ctx.left += amount;
    bump(ctx.loans, tenant, -amount);
  }
}

function validate(spec, events) {
  const code = spec.event_error_code || "E_BAD_EVENT";
  for (const ev of events) {
    const ok = ev && typeof ev === "object"
      && (ev.kind === "borrow" || ev.kind === "give")
      && typeof ev.tenant === "string" && ev.tenant.length > 0
      && Number.isInteger(ev.amount) && ev.amount > 0;
    if (!ok) fail(code, "bad event " + JSON.stringify(ev));
  }
}

export function step(spec) {
  const state = spec.state || { loans: [], left: spec.pool || 0, borrows: 0, ledger: [], applied: [] };
  const events = spec.events || [];
  validate(spec, events);
  const ctx = makeCtx(spec, state);
  const applied = new Set(state.applied || []);
  const queue = (state.ledger || []).map(function (item) {
    return { kind: item[0], tenant: item[1], amount: item[2] };
  });
  for (const ev of events) {
    if (ev.id !== undefined && applied.has(ev.id)) continue;
    queue.push({ kind: ev.kind, tenant: ev.tenant, amount: ev.amount, id: ev.id });
  }
  let budget = spec.budget || 0;
  let served = 0;
  const ledger = [];
  let i = 0;
  for (; i < queue.length && budget > 0; i += 1, budget -= 1) {
    const item = queue[i];
    applyOne(ctx, item.kind, item.tenant, item.amount);
    served += 1;
    if (item.id !== undefined) applied.add(item.id);
  }
  for (; i < queue.length; i += 1) {
    const item = queue[i];
    ledger.push([item.kind, item.tenant, item.amount]);
    if (item.id !== undefined) applied.add(item.id);
  }
  const next = {
    loans: ctx.loans, left: ctx.left, borrows: ctx.borrows,
    ledger: ledger, applied: Array.from(applied)
  };
  return {
    state: next, served: served,
    ledger_before: ledger.length, ledger: ledger.map(function (row) { return row.slice(); }),
    judged: served, judged_bound: (state.ledger || []).length + events.length
  };
}

export function close(spec) {
  const state = spec.state || { loans: [], left: spec.pool || 0, borrows: 0, ledger: [], applied: [] };
  const ctx = makeCtx(spec, state);
  let catchup = 0;
  for (const item of state.ledger || []) {
    applyOne(ctx, item[0], item[1], item[2]);
    catchup += 1;
  }
  return {
    state: {
      loans: ctx.loans, left: ctx.left, borrows: ctx.borrows,
      ledger: [], applied: (state.applied || []).slice()
    },
    catchup: catchup
  };
}

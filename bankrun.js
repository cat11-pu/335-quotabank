// bankrun.js：按处理预算处理并留账
import { borrowOf } from "./bank.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function signatureOf(kind, tenant, amount) {
  return JSON.stringify([kind, tenant, amount]);
}

function validateEvent(event, spec) {
  const ok = event && typeof event === "object"
    && (event.kind === "borrow" || event.kind === "give")
    && typeof event.tenant === "string" && event.tenant.length > 0
    && Number.isInteger(event.amount) && event.amount > 0;
  if (!ok) fail(spec.event_error_code || "E_BAD_EVENT", "bad event");
}

function addLoan(loans, tenant, delta) {
  for (const row of loans) {
    if (row[0] === tenant) { row[1] += delta; return; }
  }
  loans.push([tenant, delta]);
}

function applyEntry(state, entry, spec) {
  const kind = entry[0];
  const tenant = entry[1];
  const amount = entry[2];
  if (kind === "borrow") {
    if (state.left < amount) fail(spec.room_error_code || "E_NO_ROOM", "no room");
    state.left -= amount;
    state.borrows += 1;
    addLoan(state.loans, tenant, amount);
  } else {
    if (borrowOf(state.loans, tenant) < amount) fail(spec.loan_error_code || "E_NO_LOAN", "no loan");
    state.left += amount;
    addLoan(state.loans, tenant, -amount);
  }
}

function run(state, queue, limit, spec) {
  const next = {
    loans: state.loans.map(function (row) { return [row[0], row[1]]; }),
    left: state.left,
    borrows: state.borrows,
    ledger: [],
    applied: state.applied.slice()
  };
  let served = 0;
  for (const entry of queue) {
    if (served >= limit) { next.ledger.push(entry); continue; }
    applyEntry(next, entry, spec);
    next.applied.push(signatureOf(entry[0], entry[1], entry[2]));
    served += 1;
  }
  next.loans.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
  return { state: next, served: served };
}

export function step(spec) {
  const state = spec.state;
  const events = spec.events || [];
  for (const event of events) validateEvent(event, spec);
  const queue = state.ledger.map(function (entry) { return [entry[0], entry[1], entry[2]]; });
  for (const event of events) {
    if (state.applied.indexOf(signatureOf(event.kind, event.tenant, event.amount)) !== -1) continue;
    queue.push([event.kind, event.tenant, event.amount]);
  }
  const budget = Math.max(0, spec.budget || 0);
  const ran = run(state, queue, budget, spec);
  return {
    state: ran.state,
    served: ran.served,
    ledger_before: ran.state.ledger.length,
    ledger: ran.state.ledger,
    judged: ran.served,
    judged_bound: queue.length
  };
}

export function close(spec) {
  const state = spec.state;
  const queue = state.ledger.map(function (entry) { return [entry[0], entry[1], entry[2]]; });
  const ran = run(state, queue, queue.length, spec);
  return { state: ran.state, catchup: ran.served };
}

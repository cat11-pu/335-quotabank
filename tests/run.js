import assert from "node:assert";
import { borrowOf, leftOf } from "../bank.js";
import { step, close } from "../bankrun.js";

const base = {
  budget: 1, pool: 10,
  state: { loans: [], left: 10, borrows: 0, ledger: [], applied: [] },
  events: [{ id: 1, kind: "borrow", tenant: "a", amount: 4 }],
  room_error_code: "E_NO_ROOM", loan_error_code: "E_NO_LOAN",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("borrowOf returns a number", () => {
  assert.strictEqual(typeof borrowOf([], "z"), "number");
});

check("leftOf returns a number", () => {
  assert.strictEqual(typeof leftOf(10, [["z", 3]]), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);

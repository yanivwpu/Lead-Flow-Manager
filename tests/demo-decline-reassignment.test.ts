/**
 * Regression: demo decline must persist reason, unassign when no replacement, and never loop to decliner.
 * Run: npx tsx tests/demo-decline-reassignment.test.ts
 */
import { mapDemoBookingRow } from "../server/demoBookingRows";
import {
  buildDemoDeclineReassignmentUpdate,
  filterDemoEligibleSalespeople,
} from "../server/demoAssignmentService";
import { DEMO_BOOKING_STATUS } from "../shared/salesCompensation";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const people = [
  { id: "sp1", totalBookings: 2, role: "sales" },
  { id: "sp2", totalBookings: 1, role: "both" },
  { id: "sp3", totalBookings: 0, role: "setup" },
];

const eligible = filterDemoEligibleSalespeople(people, "sp1");
assert(eligible.length === 1 && eligible[0].id === "sp2", "declining salesperson excluded from pool");

const onlyOne = filterDemoEligibleSalespeople([people[0]], "sp1");
assert(onlyOne.length === 0, "single salesperson excluded leaves empty pool");

const noReplacement = buildDemoDeclineReassignmentUpdate(
  { salespersonId: "sp1" },
  {
    declineReason: "Schedule conflict",
    declinedBySalespersonId: "sp1",
    nextSalespersonId: null,
  },
);
assert(noReplacement.salespersonId === null, "no replacement clears assignee");
assert(
  noReplacement.status === DEMO_BOOKING_STATUS.needsReassignment,
  "no replacement sets needs_reassignment",
);
assert(noReplacement.declineReason === "Schedule conflict", "decline reason saved");
assert(noReplacement.declinedBySalespersonId === "sp1", "declined-by saved");
assert(noReplacement.declinedAt instanceof Date, "declined-at saved");

const reassigned = buildDemoDeclineReassignmentUpdate(
  { salespersonId: "sp1" },
  {
    declineReason: "Not available",
    declinedBySalespersonId: "sp1",
    nextSalespersonId: "sp2",
  },
);
assert(reassigned.salespersonId === "sp2", "reassigns to another salesperson");
assert(
  reassigned.status === DEMO_BOOKING_STATUS.pendingAcceptance,
  "reassigned booking awaits acceptance",
);
assert(reassigned.declineReason === "Not available", "decline reason saved on reassign");

const loopGuard = buildDemoDeclineReassignmentUpdate(
  { salespersonId: "sp1" },
  {
    declineReason: "Busy",
    declinedBySalespersonId: "sp1",
    nextSalespersonId: "sp1",
  },
);
assert(loopGuard.salespersonId === null, "same salesperson never reassigned back");
assert(
  loopGuard.status === DEMO_BOOKING_STATUS.needsReassignment,
  "same-id next falls back to needs_reassignment",
);

const adminRow = mapDemoBookingRow({
  id: "b3",
  salesperson_id: null,
  visitor_name: "Test 2",
  visitor_email: "test2@example.com",
  visitor_phone: "555",
  scheduled_date: "2026-06-10T14:30:00.000Z",
  status: "needs_reassignment",
  decline_reason: "Schedule conflict",
  declined_by_salesperson_id: "sp1",
  declined_at: "2026-06-07T12:00:00.000Z",
  created_at: "2026-06-07T10:00:00.000Z",
});
assert(adminRow.salespersonId === null, "admin row maps null assignee");
assert(adminRow.declineReason === "Schedule conflict", "admin row maps decline reason");
assert(adminRow.declinedBySalespersonId === "sp1", "admin row maps declined-by");
assert(adminRow.declinedAt instanceof Date, "admin row maps declined-at");

console.log("demo-decline-reassignment.test.ts: OK");

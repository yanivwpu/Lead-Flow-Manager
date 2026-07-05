/**
 * Unit checks for demo booking row normalization.
 * Run: npx tsx tests/demo-booking-rows.test.ts
 */
import { mapDemoBookingRow } from "../server/demoBookingRows";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const snake = mapDemoBookingRow({
  id: "b1",
  salesperson_id: "sp1",
  visitor_name: "Jane Doe",
  visitor_email: "jane@example.com",
  visitor_phone: "+15551234567",
  scheduled_date: "2026-06-10T14:30:00.000Z",
  consent_given: true,
  status: "pending_acceptance",
  notes: null,
  created_at: "2026-06-07T10:00:00.000Z",
  source: "web",
});

assert(snake.visitorName === "Jane Doe", "visitorName from snake_case");
assert(snake.visitorEmail === "jane@example.com", "visitorEmail from snake_case");
assert(snake.salespersonId === "sp1", "salespersonId from snake_case");
assert(!Number.isNaN(snake.scheduledDate!.getTime()), "scheduledDate parses");

const awaiting = mapDemoBookingRow({
  id: "b3",
  salesperson_id: "sp3",
  visitor_name: "Pat",
  visitor_email: "pat@example.com",
  visitor_phone: "555",
  scheduled_date: null,
  status: "awaiting_schedule",
  meeting_link: "https://zoom.us/j/123",
});
assert(awaiting.scheduledDate === null, "null scheduled_date");
assert(awaiting.meetingLink === "https://zoom.us/j/123", "meeting_link maps");

const camel = mapDemoBookingRow({
  id: "b2",
  salespersonId: "sp2",
  visitorName: "John",
  visitorEmail: "john@example.com",
  visitorPhone: "555",
  scheduledDate: new Date("2026-06-11T09:00:00.000Z"),
  status: "accepted",
});

assert(camel.visitorName === "John", "visitorName from camelCase");
assert(camel.salespersonId === "sp2", "salespersonId from camelCase");

console.log("demo-booking-rows.test.ts: OK");

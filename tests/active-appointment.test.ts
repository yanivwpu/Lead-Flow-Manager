import test from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_SCHEDULED_TAG,
  isActiveFutureAppointment,
  isCrmDisplayTag,
  nextActiveAppointmentByContact,
} from "../shared/activeAppointment";

test("isActiveFutureAppointment accepts scheduled future dates", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  assert.equal(isActiveFutureAppointment({ status: "scheduled", appointmentDate: future }), true);
});

test("isActiveFutureAppointment rejects cancelled and past scheduled rows", () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal(isActiveFutureAppointment({ status: "cancelled", appointmentDate: past }), false);
  assert.equal(isActiveFutureAppointment({ status: "scheduled", appointmentDate: past }), false);
  assert.equal(isActiveFutureAppointment({ status: "rescheduled", appointmentDate: futureIso() }), false);
});

test("isCrmDisplayTag excludes legacy appointment label on contacts.tag", () => {
  assert.equal(isCrmDisplayTag("Hot"), true);
  assert.equal(isCrmDisplayTag(APPOINTMENT_SCHEDULED_TAG), false);
  assert.equal(isCrmDisplayTag(""), false);
});

test("nextActiveAppointmentByContact picks earliest upcoming per contact", () => {
  const future1 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const future2 = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const map = nextActiveAppointmentByContact([
    { contactId: "c1", status: "scheduled", appointmentDate: future2 },
    { contactId: "c1", status: "scheduled", appointmentDate: future1 },
    { contactId: "c2", status: "cancelled", appointmentDate: future1 },
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get("c1")?.appointmentDate, future1);
});

function futureIso() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

console.log("active-appointment.test.ts passed");

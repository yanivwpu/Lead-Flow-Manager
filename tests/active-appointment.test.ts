import test from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_SCHEDULED_TAG,
  isActiveFutureAppointment,
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

function futureIso() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

test("APPOINTMENT_SCHEDULED_TAG is the Calendly booking badge label", () => {
  assert.equal(APPOINTMENT_SCHEDULED_TAG, "Appointment Scheduled");
});

console.log("active-appointment.test.ts passed");

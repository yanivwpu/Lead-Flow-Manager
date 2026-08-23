/**
 * Unscheduled demo assignment emails, Admin KPI, workload, and Calendly confirmation.
 * Run: npx tsx --test tests/demo-unscheduled-assignment.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  countOpenDemoRequests,
  evaluateAdminDemoStatusChange,
  isActiveDemoAssignmentWorkloadStatus,
  isDemoCompleted,
  isOpenDemoRequestStatus,
  isQualifyingPaidPlan,
  pickLeastLoadedSalesperson,
  SALES_CONVERSION_PAYOUT_DOLLARS,
} from "../shared/salesCompensation";
import { formatDemoScheduleDisplay, formatDemoScheduledDate } from "../shared/demoBookingDisplay";
import {
  demoRequestAssignedEmailSubject,
  demoScheduledEmailSubject,
  maskEmailForLogs,
  renderUnscheduledDemoRequestEmailHtml,
  sanitizeEmailProviderError,
} from "../server/email";
import { shouldSkipDuplicateMarketingDemoConfirm } from "../server/marketingDemoCalendlyWebhook";

describe("unscheduled assignment email template", () => {
  it("uses a distinct assignment subject and does not require a date", () => {
    assert.equal(demoRequestAssignedEmailSubject("Luciano"), "New Demo Request: Luciano");
    assert.equal(demoScheduledEmailSubject("Paulo Silas"), "Demo Scheduled: Paulo Silas");
    assert.notEqual(
      demoRequestAssignedEmailSubject("Pat"),
      demoScheduledEmailSubject("Pat"),
    );
    const html = renderUnscheduledDemoRequestEmailHtml({
      salespersonName: "Yaniv Ha",
      visitorName: "Luciano",
      visitorEmail: "lead@example.com",
      visitorPhone: "+15550001111",
      appUrl: "https://app.whachatcrm.com",
    });
    assert.match(html, /Awaiting scheduling/);
    assert.match(html, /has not chosen a time on Calendly/);
    assert.match(html, /Please contact this lead/);
    assert.match(html, /\/sales-portal/);
    assert.doesNotMatch(html, /Scheduled:/);
    assert.doesNotMatch(html, /Invalid Date/);
  });

  it("masks recipient emails for logs", () => {
    assert.equal(maskEmailForLogs("yanivharamaty@gmail.com"), "y***@gmail.com");
    assert.equal(maskEmailForLogs(""), null);
    assert.match(sanitizeEmailProviderError("Bearer re_abc123xyz failed"), /\[redacted\]/);
    assert.doesNotMatch(sanitizeEmailProviderError("Bearer re_abc123xyz failed"), /re_abc123xyz/);
  });
});

describe("compensation and earned totals", () => {
  it("does not treat unscheduled assigned leads as completed or commission-earning", () => {
    assert.equal(SALES_CONVERSION_PAYOUT_DOLLARS, 100);
    assert.equal(isDemoCompleted("awaiting_schedule"), false);
    assert.equal(isDemoCompleted("pending_acceptance"), false);
    assert.equal(isDemoCompleted("accepted"), false);
    assert.equal(isDemoCompleted("completed"), true);
    assert.equal(isQualifyingPaidPlan("free"), false);
    assert.equal(isQualifyingPaidPlan("starter"), true);
    const assignment = fs.readFileSync(
      path.join(process.cwd(), "server/demoAssignmentService.ts"),
      "utf8",
    );
    assert.match(assignment, /not `salespeople\.totalBookings`/);
    assert.doesNotMatch(assignment, /setupTaskEarningsTotal/);
  });
});

describe("Admin pending demos KPI", () => {
  it("includes awaiting_schedule and pending_acceptance only", () => {
    const bookings = [
      { status: "awaiting_schedule" },
      { status: "pending_acceptance" },
      { status: "pending" },
      { status: "accepted" },
      { status: "completed" },
      { status: "converted" },
      { status: "cancelled" },
      { status: "needs_reassignment" },
    ];
    assert.equal(isOpenDemoRequestStatus("awaiting_schedule"), true);
    assert.equal(isOpenDemoRequestStatus("pending_acceptance"), true);
    assert.equal(isOpenDemoRequestStatus("pending"), true);
    assert.equal(isOpenDemoRequestStatus("accepted"), false);
    assert.equal(isOpenDemoRequestStatus("completed"), false);
    assert.equal(countOpenDemoRequests(bookings), 3);
  });

  it("Admin KPI uses countOpenDemoRequests and status select includes awaiting_schedule", () => {
    const admin = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Admin.tsx"), "utf8");
    assert.match(admin, /countOpenDemoRequests\(bookings\)/);
    assert.match(admin, /label="Pending demos"/);
    assert.match(admin, /option value="awaiting_schedule">Awaiting schedule/);
    assert.match(admin, /formatDemoScheduleDisplay\(booking\.scheduledDate, booking\.status\)/);
    assert.match(admin, /evaluateAdminDemoStatusChange/);
  });
});

describe("Admin status change without scheduled date", () => {
  it("allows awaiting_schedule and cancelled; blocks pending_acceptance without a date", () => {
    assert.equal(
      evaluateAdminDemoStatusChange({ nextStatus: "awaiting_schedule", scheduledDate: null }).ok,
      true,
    );
    assert.equal(
      evaluateAdminDemoStatusChange({ nextStatus: "cancelled", scheduledDate: null }).ok,
      true,
    );
    assert.equal(
      evaluateAdminDemoStatusChange({ nextStatus: "pending_acceptance", scheduledDate: null }).ok,
      false,
    );
    assert.equal(
      evaluateAdminDemoStatusChange({ nextStatus: "accepted", scheduledDate: null }).ok,
      false,
    );
    assert.equal(
      evaluateAdminDemoStatusChange({
        nextStatus: "pending_acceptance",
        scheduledDate: "2026-07-10T15:00:00.000Z",
      }).ok,
      true,
    );
  });
});

describe("assignment workload", () => {
  it("counts unscheduled assigned leads and prefers the least loaded salesperson", () => {
    assert.equal(isActiveDemoAssignmentWorkloadStatus("awaiting_schedule"), true);
    assert.equal(isActiveDemoAssignmentWorkloadStatus("pending_acceptance"), true);
    assert.equal(isActiveDemoAssignmentWorkloadStatus("accepted"), true);
    assert.equal(isActiveDemoAssignmentWorkloadStatus("completed"), false);
    assert.equal(isActiveDemoAssignmentWorkloadStatus("converted"), false);

    const picked = pickLeastLoadedSalesperson(
      [{ id: "sp-loaded" }, { id: "sp-free" }],
      { "sp-loaded": 3, "sp-free": 0 },
    );
    assert.equal(picked?.id, "sp-free");

    // One assigned row stays one unit of load after Calendly moves awaiting → pending_acceptance.
    assert.equal(
      ["awaiting_schedule", "pending_acceptance"].filter(isActiveDemoAssignmentWorkloadStatus).length,
      2,
    );
    const afterConfirm = pickLeastLoadedSalesperson(
      [{ id: "sp-a" }, { id: "sp-b" }],
      { "sp-a": 1, "sp-b": 0 },
    );
    assert.equal(afterConfirm?.id, "sp-b");
  });

  it("picker uses live active assigned counts instead of totalBookings", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/demoAssignmentService.ts"),
      "utf8",
    );
    assert.match(src, /countActiveAssignedDemoLeadsBySalespersonId/);
    assert.match(src, /pickLeastLoadedSalesperson/);
    assert.doesNotMatch(
      src.slice(src.indexOf("export async function pickSalespersonForDemoAssignment")),
      /totalBookings \|\| 0/,
    );
    const storageSrc = fs.readFileSync(path.join(process.cwd(), "server/storage.ts"), "utf8");
    assert.match(storageSrc, /skipBookingCount = booking.status === "awaiting_schedule"/);
  });
});

describe("schedule display", () => {
  it("does not invent a datetime for awaiting_schedule", () => {
    assert.equal(formatDemoScheduleDisplay(null, "awaiting_schedule"), "Not scheduled yet");
    assert.equal(formatDemoScheduledDate(null), "—");
    assert.notEqual(formatDemoScheduleDisplay(null, "awaiting_schedule"), formatDemoScheduledDate(new Date()));
  });
});

describe("API wiring", () => {
  it("sends assignment email after /api/demo/book and does not fail the booking on notify throw", () => {
    const routes = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
    const bookStart = routes.indexOf('app.post("/api/demo/book"');
    const bookEnd = routes.indexOf("app.post(\"/api/admin/login\"", bookStart);
    const book = routes.slice(bookStart, bookEnd);
    assert.match(book, /notifyAssignedSalespersonOfUnscheduledDemo/);
    assert.match(book, /assignment_notify_threw/);
    assert.match(book, /calendlyUrl/);

    const portal = routes.slice(
      routes.indexOf('app.get("/api/sales-portal/demos"'),
      routes.indexOf('app.patch("/api/sales-portal/demos/:id/accept"'),
    );
    assert.doesNotMatch(portal, /awaitingSchedule/);
    assert.match(portal, /getDemoBookingsBySalesperson/);
  });

  it("Calendly confirmation uses distinct scheduled notification and skips duplicates", () => {
    const hook = fs.readFileSync(
      path.join(process.cwd(), "server/marketingDemoCalendlyWebhook.ts"),
      "utf8",
    );
    assert.match(hook, /notifyAssignedSalespersonOfScheduledDemo/);
    assert.match(hook, /confirm_race_or_already_confirmed/);
    assert.match(hook, /already_calendly_confirmed/);
    assert.match(hook, /duplicate_event_ignored/);
    assert.doesNotMatch(hook, /sendDemoBookingNotification\(/);

    const email = fs.readFileSync(path.join(process.cwd(), "server/email.ts"), "utf8");
    assert.match(email, /demoScheduledEmailSubject/);
    assert.match(email, /New Demo Request/);
    assert.doesNotMatch(
      email.slice(email.indexOf("export async function sendDemoScheduledNotificationDetailed")),
      /New Demo Booking:/,
    );
  });

  it("Sales Portal shows awaiting-schedule tab without accept/decline", () => {
    const portal = fs.readFileSync(path.join(process.cwd(), "client/src/pages/SalesPortal.tsx"), "utf8");
    assert.match(portal, /awaitingScheduleDemos/);
    assert.match(portal, /value="awaiting-schedule"/);
    assert.match(portal, /formatDemoScheduleDisplay/);
    const awaitingContent = portal.slice(
      portal.indexOf('<TabsContent value="awaiting-schedule">'),
      portal.indexOf('<TabsContent value="pending-acceptance">'),
    );
    assert.doesNotMatch(awaitingContent, /acceptDemo\.mutate/);
    assert.match(awaitingContent, /Not scheduled|No scheduled date/);
  });
});

describe("Calendly scheduled notification idempotency", () => {
  it("skips retries after confirmation so the scheduled email is not duplicated", () => {
    assert.equal(
      shouldSkipDuplicateMarketingDemoConfirm({
        status: "pending_acceptance",
        calendlyConfirmedAt: new Date(),
        calendlyScheduledEventUri: "https://api.calendly.com/scheduled_events/abc",
        incomingScheduledEventUri: "https://api.calendly.com/scheduled_events/abc",
      }).skip,
      true,
    );
    assert.equal(
      shouldSkipDuplicateMarketingDemoConfirm({
        status: "awaiting_schedule",
        calendlyConfirmedAt: null,
        calendlyScheduledEventUri: null,
        incomingScheduledEventUri: "https://api.calendly.com/scheduled_events/abc",
      }).skip,
      false,
    );
  });
});

describe("assignment email skip without salesperson email", () => {
  it("does not throw when salesperson email is missing", async () => {
    const { notifyAssignedSalespersonOfUnscheduledDemo } = await import(
      "../server/demoSalespersonNotifications"
    );
    const result = await notifyAssignedSalespersonOfUnscheduledDemo({
      bookingId: "booking-1",
      salespersonId: "sp-1",
      salespersonEmail: null,
      salespersonName: "Yaniv",
      visitorName: "Luciano",
      visitorEmail: "lead@example.com",
      visitorPhone: "555",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "no_salesperson_email");
  });
});

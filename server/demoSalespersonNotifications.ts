/**
 * Privacy-safe salesperson demo-request email dispatch.
 * Never logs email bodies, API keys, or visitor message content.
 */
import {
  maskEmailForLogs,
  sanitizeEmailProviderError,
  sendDemoScheduledNotificationDetailed,
  sendUnscheduledDemoRequestNotification,
  type EmailDispatchResult,
} from "./email";

export type DemoSalespersonNotificationType = "assignment_unscheduled" | "calendly_scheduled";

function logDemoSalespersonNotification(params: {
  notificationType: DemoSalespersonNotificationType;
  bookingId: string;
  salespersonId: string | null;
  recipientEmail: string | null;
  result: EmailDispatchResult;
}): void {
  console.log(
    JSON.stringify({
      tag: "[DemoSalespersonEmail]",
      event: params.result.ok ? "sent" : "failed",
      notificationType: params.notificationType,
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientMasked: maskEmailForLogs(params.recipientEmail),
      success: params.result.ok,
      providerMessageId: params.result.providerMessageId,
      error: params.result.error,
    }),
  );
}

export async function notifyAssignedSalespersonOfUnscheduledDemo(params: {
  bookingId: string;
  salespersonId: string | null;
  salespersonEmail: string | null | undefined;
  salespersonName: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
}): Promise<EmailDispatchResult> {
  if (!params.salespersonEmail?.trim()) {
    const result: EmailDispatchResult = {
      ok: false,
      providerMessageId: null,
      error: "no_salesperson_email",
    };
    logDemoSalespersonNotification({
      notificationType: "assignment_unscheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: null,
      result,
    });
    return result;
  }
  try {
    const result = await sendUnscheduledDemoRequestNotification(
      params.salespersonEmail.trim(),
      params.salespersonName,
      {
        name: params.visitorName,
        email: params.visitorEmail,
        phone: params.visitorPhone,
      },
    );
    logDemoSalespersonNotification({
      notificationType: "assignment_unscheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: params.salespersonEmail,
      result,
    });
    return result;
  } catch (err) {
    const result: EmailDispatchResult = {
      ok: false,
      providerMessageId: null,
      error: err instanceof Error ? sanitizeEmailProviderError(err.message) : "dispatch_threw",
    };
    logDemoSalespersonNotification({
      notificationType: "assignment_unscheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: params.salespersonEmail,
      result,
    });
    return result;
  }
}

export async function notifyAssignedSalespersonOfScheduledDemo(params: {
  bookingId: string;
  salespersonId: string | null;
  salespersonEmail: string | null | undefined;
  salespersonName: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  scheduledDate: Date;
  meetingLink?: string | null;
}): Promise<EmailDispatchResult> {
  if (!params.salespersonEmail?.trim()) {
    const result: EmailDispatchResult = {
      ok: false,
      providerMessageId: null,
      error: "no_salesperson_email",
    };
    logDemoSalespersonNotification({
      notificationType: "calendly_scheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: null,
      result,
    });
    return result;
  }
  try {
    const result = await sendDemoScheduledNotificationDetailed(
      params.salespersonEmail.trim(),
      params.salespersonName,
      {
        name: params.visitorName,
        email: params.visitorEmail,
        phone: params.visitorPhone,
        scheduledDate: params.scheduledDate,
      },
      params.meetingLink,
    );
    logDemoSalespersonNotification({
      notificationType: "calendly_scheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: params.salespersonEmail,
      result,
    });
    return result;
  } catch (err) {
    const result: EmailDispatchResult = {
      ok: false,
      providerMessageId: null,
      error: err instanceof Error ? sanitizeEmailProviderError(err.message) : "dispatch_threw",
    };
    logDemoSalespersonNotification({
      notificationType: "calendly_scheduled",
      bookingId: params.bookingId,
      salespersonId: params.salespersonId,
      recipientEmail: params.salespersonEmail,
      result,
    });
    return result;
  }
}

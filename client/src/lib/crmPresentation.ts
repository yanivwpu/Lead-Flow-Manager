import type { TFunction } from "i18next";
import { getContactDisplayChannelLabel } from "@shared/contactChannelDisplay";

export function crmStageLabel(t: TFunction, stage: string | null | undefined) {
  switch (stage) {
    case "Lead": return t("crmDetails.lead");
    case "Contacted": return t("crmDetails.contacted");
    case "Proposal": return t("crmDetails.proposal");
    case "Negotiation": return t("crmDetails.negotiation");
    case "Closed": return t("crmDetails.closed");
    case "New Lead": return t("crmDetails.newLead");
    case "Responded": return t("crmDetails.responded");
    case "Qualified (Hot)": return t("crmDetails.qualifiedHot");
    case "Qualified (Warm)": return t("crmDetails.qualifiedWarm");
    case "Nurture / Follow-Up": return t("crmDetails.nurture");
    case "Appointment Set": return t("crmDetails.appointmentSet");
    case "Under Contract": return t("crmDetails.underContract");
    case "Unqualified": return t("crmDetails.unqualified");
    case "Appointment Requested": return t("crmDetails.appointmentRequested");
    case "Appointment Booked": return t("inboxUi.appointmentBooked");
    default: return stage || t("crmDetails.noStage");
  }
}

export function crmTagLabel(t: TFunction, tag: string | null | undefined) {
  switch (tag) {
    case "New": return t("crmDetails.newTag");
    case "Hot": return t("crmDetails.hotTag");
    case "Quoted": return t("crmDetails.quotedTag");
    case "Paid": return t("crmDetails.paidTag");
    case "Waiting": return t("crmDetails.waitingTag");
    case "Lost": return t("crmDetails.lostTag");
    case "Warm": return t("crmDetails.warmTag");
    case "Hot Lead": return t("crmDetails.hotLead");
    case "Warm Lead": return t("crmDetails.warmLead");
    case "Cold": return t("crmDetails.coldTag");
    case "Cold Lead": return t("crmDetails.coldLead");
    case "Investor": return t("crmDetails.investor");
    case "Customer": return t("crmDetails.customer");
    case "Buyer": return t("crmDetails.buyer");
    case "Seller": return t("crmDetails.seller");
    case "Lead": return t("crmDetails.lead");
    default: return tag || t("crmDetails.noTag");
  }
}

export function crmChannelLabel(t: TFunction, channel: string | null | undefined) {
  switch (channel) {
    case undefined:
    case null:
    case "__none__": return t("crmDetails.noChannel");
    case "webchat": return t("inboxUi.websiteChat");
    case "email": return t("inboxUi.emailChannel");
    default: return getContactDisplayChannelLabel(channel);
  }
}

export function crmAppointmentType(t: TFunction, type: string | null | undefined) {
  return !type || type === "Appointment" ? t("crmDetails.appointment") : type;
}

export function crmAppointmentStatus(t: TFunction, status: string) {
  switch (status) {
    case "scheduled": return t("crmDetails.scheduled");
    case "confirmed": return t("crmDetails.confirmed");
    case "canceled":
    case "cancelled": return t("crmDetails.canceled");
    case "completed": return t("crmDetails.completed");
    case "rescheduled": return t("crmDetails.rescheduled");
    default: return status;
  }
}

export function crmInquiryLabel(t: TFunction, source: string) {
  switch (source) {
    case "Agent Page Inquiry": return t("crmDetails.agentPageInquiry");
    case "MLS Property Inquiry": return t("crmDetails.mlsInquiry");
    case "Agent Page": return t("crmDetails.agentPage");
    case "Embedded Agent Page": return t("crmDetails.embeddedAgentPage");
    case "Website Chat": return t("inboxUi.websiteChat");
  }
  const neighborhoodPrefix = "Neighborhood Inquiry · ";
  return source.startsWith(neighborhoodPrefix)
    ? t("crmDetails.neighborhoodInquiry", { name: source.slice(neighborhoodPrefix.length) })
    : source;
}

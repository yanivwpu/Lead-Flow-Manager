import type { TFunction } from "i18next";

// Core action labels also identify composer behavior. Translate only the visible label.
export function copilotActionLabel(label: string, t: TFunction): string {
  switch (label) {
    case "Share matching listings": return t("inboxUi.copilotShareMatchingListings");
    case "Confirm showing availability": return t("inboxUi.copilotConfirmShowingAvailability");
    case "Schedule showing": return t("inboxUi.copilotScheduleShowing");
    case "Send more matches": return t("inboxUi.copilotSendMoreMatches");
    case "Explain Listing Options": return t("inboxUi.copilotExplainListingOptions");
    case "Qualify Business Listing": return t("inboxUi.copilotQualifyBusinessListing");
    case "Answer From Knowledge": return t("inboxUi.copilotAnswerFromKnowledge");
    case "Qualify Trip Details": return t("inboxUi.copilotQualifyTripDetails");
    case "Understand Intent": return t("inboxUi.copilotUnderstandIntent");
    case "Discover Needs": return t("inboxUi.copilotDiscoverNeeds");
    case "Ask Clarifying Question": return t("inboxUi.copilotAskClarifyingQuestion");
    case "Qualify Visitor": return t("inboxUi.copilotQualifyVisitor");
    case "No action needed": return t("inboxUi.copilotNoActionNeeded");
    case "Request CMA Information": return t("inboxUi.copilotRequestCmaInformation");
    case "Request Property Address": return t("inboxUi.copilotRequestPropertyAddress");
    case "Book Listing Consultation": return t("inboxUi.copilotBookListingConsultation");
    case "Assign Listing Agent": return t("inboxUi.copilotAssignListingAgent");
    case "Follow Up": return t("inboxUi.copilotFollowUp");
    case "Prepare for booked appointment": return t("inboxUi.copilotPrepareForBookedAppointment");
    case "Help complete scheduling": return t("inboxUi.copilotHelpCompleteScheduling");
    case "Help the visitor schedule": return t("inboxUi.copilotHelpTheVisitorSchedule");
    case "Clarify chat vs schedule": return t("inboxUi.copilotClarifyChatVsSchedule");
    case "Assign agent": return t("inboxUi.copilotAssignAgent");
    case "Enroll in nurture campaign": return t("inboxUi.copilotEnrollInNurtureCampaign");
    case "Send nurture follow-up": return t("inboxUi.copilotSendNurtureFollow-up");
    case "Ask qualifying question": return t("inboxUi.copilotAskQualifyingQuestion");
    case "Send available time options": return t("inboxUi.copilotSendAvailableTimeOptions");
    case "Ask if financing is already arranged": return t("inboxUi.copilotAskIfFinancingIsAlreadyArranged");
    case "Contact customer": return t("inboxUi.copilotContactCustomer");
    case "Schedule appointment": return t("inboxUi.copilotScheduleAppointment");
    case "Follow up if no response": return t("inboxUi.copilotFollowUpIfNoResponse");
    case "Reply personally": return t("inboxUi.copilotReplyPersonally");
    default:
      return /^Confirm .+ availability$/.test(label)
        ? t("inboxUi.copilotConfirmShowingAvailability")
        : label;
  }
}

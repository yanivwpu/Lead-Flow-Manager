import type { TFunction } from "i18next";

// Catalog text is presentation metadata. Identifiers and authored defaults stay on the records.
export function builderCatalogText(t: TFunction, copy: string) {
  switch (copy) {
    case "Conversations": return t("builderCatalog.conversations");
    case "Timing": return t("builderCatalog.timing");
    case "Message Logic": return t("builderCatalog.messageLogic");
    case "Integrations": return t("builderCatalog.integrations");
    case "New Chat Created": return t("builderCatalog.newChat");
    case "A brand new conversation is started": return t("builderCatalog.newChatHelp");
    case "New Message Received": return t("builderCatalog.newMessage");
    case "An inbound message arrives": return t("builderCatalog.newMessageHelp");
    case "Tag Added": return t("builderCatalog.tagAdded");
    case "A tag is applied to a contact": return t("builderCatalog.tagAddedHelp");
    case "Tag Removed": return t("builderCatalog.tagRemoved");
    case "A tag is removed from a contact": return t("builderCatalog.tagRemovedHelp");
    case "Pipeline Stage Changed": return t("builderCatalog.stageChanged");
    case "Runs when a contact moves to a different pipeline stage.": return t("builderCatalog.stageChangedHelp");
    case "No Reply For": return t("builderCatalog.noReply");
    case "Runs when a contact has not replied after your selected delay.": return t("builderCatalog.noReplyHelp");
    case "Keyword Detected": return t("builderCatalog.keywordDetected");
    case "A message contains a keyword": return t("builderCatalog.keywordDetectedHelp");
    case "App Event Received": return t("builderCatalog.appEvent");
    case "Another connected tool sends an event": return t("builderCatalog.appEventHelp");
    case "Form Submitted": return t("builderCatalog.formSubmitted");
    case "A lead form or widget is submitted": return t("builderCatalog.formSubmittedHelp");
    case "Assign to Team Member": return t("builderCatalog.assign");
    case "Route to an agent or round robin": return t("builderCatalog.assignHelp");
    case "Set Tag": return t("builderCatalog.setTag");
    case "Apply a label to the contact": return t("builderCatalog.setTagHelp");
    case "Set Status": return t("builderCatalog.setStatus");
    case "Change conversation status": return t("builderCatalog.setStatusHelp");
    case "Set Pipeline Stage": return t("builderCatalog.setStage");
    case "Move contact to a pipeline stage": return t("builderCatalog.setStageHelp");
    case "Add Note": return t("builderCatalog.addNote");
    case "Attach a note to the conversation": return t("builderCatalog.addNoteHelp");
    case "Set Follow-up": return t("builderCatalog.setFollowUp");
    case "Schedule a future follow-up": return t("builderCatalog.setFollowUpHelp");
    case "Create / Update Lead": return t("builderCatalog.createLead");
    case "Ensure CRM lead exists for the conversation": return t("builderCatalog.createLeadHelp");
    case "Apply Tag": return t("builderCatalog.applyTag");
    case "Apply a realtor template tag": return t("builderCatalog.applyTagHelp");
    case "Move lead to a pipeline stage": return t("builderCatalog.growthStageHelp");
    case "Send WhatsApp Template": return t("builderCatalog.sendTemplate");
    case "Send a Growth Engine message template": return t("builderCatalog.sendTemplateHelp");
    case "Create Task": return t("builderCatalog.createTask");
    case "Create an internal follow-up task": return t("builderCatalog.createTaskHelp");
    case "Detect Language": return t("builderCatalog.detectLanguage");
    case "Detect language from the inbound message": return t("builderCatalog.detectLanguageHelp");
    case "Update Lead Fields": return t("builderCatalog.updateLead");
    case "Write detected fields onto the lead": return t("builderCatalog.updateLeadHelp");
    case "Run Lead Scoring": return t("builderCatalog.score");
    case "AI Brain scoring (when enabled)": return t("builderCatalog.scoreHelp");
    case "Growth Engine": return t("builderCatalog.growthEngine");
    case "Any Channel": return t("builderCatalog.anyChannel");
    case "Web Chat": return t("builderCatalog.webChat");
    case "Channel": return t("builderCatalog.channel");
    case "Keyword": return t("builderCatalog.keyword");
    case "Tag": return t("builderCatalog.tag");
    case "Stage": return t("builderCatalog.stage");
    case "Select channel": return t("builderCatalog.selectChannel");
    case "Select tag": return t("builderCatalog.selectTag");
    case "Select stage": return t("builderCatalog.selectStage");
    case "Assign New Leads": return t("builderCatalog.assignLeads");
    case "Auto-assign every new chat via round robin": return t("builderCatalog.assignLeadsHelp");
    case "Tag and Route Leads": return t("builderCatalog.tagLeads");
    case "Tag new chats and move them to the pipeline": return t("builderCatalog.tagLeadsHelp");
    case "Keyword Follow-up": return t("builderCatalog.keywordFollowUp");
    case "Set a follow-up when a keyword is detected": return t("builderCatalog.keywordFollowUpHelp");
    case "Close Won": return t("builderCatalog.closeWon");
    case "Mark paid leads and resolve the conversation": return t("builderCatalog.closeWonHelp");
    case "Basic Lead Nurture": return t("builderCatalog.basicNurture");
    case "3-step follow-up over 5 days": return t("builderCatalog.basicNurtureHelp");
    case "Re-engagement Follow-up": return t("builderCatalog.reengage");
    case "Win back silent contacts over 2 weeks": return t("builderCatalog.reengageHelp");
    case "Appointment Reminder": return t("builderCatalog.appointmentReminder");
    case "Confirm upcoming appointments automatically": return t("builderCatalog.appointmentReminderHelp");
    case "Send Message": return t("builderCatalog.sendMessage");
    case "Send text, media, files, buttons, or templates": return t("builderCatalog.sendMessageHelp");
    case "Ask Question": return t("builderCatalog.askQuestion");
    case "Ask, wait for one reply, save it, then continue": return t("builderCatalog.askQuestionHelp");
    case "Wait": return t("builderCatalog.wait");
    case "Pause before continuing (up to 5 min)": return t("builderCatalog.waitHelp");
    case "Action": return t("builderCatalog.action");
    case "Tag, assign, update status, or move pipeline": return t("builderCatalog.actionHelp");
    case "Text": return t("builderCatalog.text");
    case "Image": return t("builderCatalog.image");
    case "Video": return t("builderCatalog.video");
    case "File": return t("builderCatalog.file");
    case "Buttons": return t("builderCatalog.buttons");
    case "Form": return t("builderCatalog.form");
    case "Template": return t("builderCatalog.template");
    case "Add Tag": return t("builderCatalog.addTag");
    case "Assign to Team": return t("builderCatalog.assignTeam");
    case "Move Pipeline Stage": return t("builderCatalog.movePipeline");
    case "AI Shopping Assistant": return t("builderFeedback.aiShopping");
    case "Use a lowercase letter, then letters, numbers, or underscores.": return t("builderFeedback.fieldIdFormat");
    case "Field IDs must be unique.": return t("builderFeedback.fieldIdUnique");
    case "This field is incomplete.": return t("builderFeedback.fieldIncomplete");
    case "Choose a supported field type.": return t("builderFeedback.fieldType");
    case "Enter a label. HTML is not allowed.": return t("builderFeedback.fieldLabel");
    case "Add at least one option.": return t("builderFeedback.fieldOption");
    case "Consent text is required.": return t("builderFeedback.fieldConsent");
    case "Select": return t("builderFeedback.fieldSelect");
    case "Radio": return t("builderFeedback.fieldRadio");
    case "Checkbox": return t("builderFeedback.fieldCheckbox");
    case "Date": return t("builderFeedback.fieldDate");
    case "Consent": return t("builderFeedback.fieldConsentType");
    case "Field is incomplete.": return t("builderFeedback.fieldIncomplete");
    default: return copy;
  }
}

export function builderDuration(language: string, count: number, unit: "minute" | "hour" | "day" | "week") {
  return new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay: "long" }).format(count);
}

export function builderStatusLabel(t: TFunction, status: string) {
  switch (status) {
    case "active": return t("automations.active");
    case "open": return t("builderFeedback.openStatus");
    case "pending": return t("builderFeedback.pendingStatus");
    case "resolved": return t("builderFeedback.resolvedStatus");
    case "closed": return t("crmDetails.closed");
    case "paused": return t("automations.paused");
    case "draft": return t("automationUi.draft");
    case "completed": return t("followups.completed");
    case "canceled":
    case "cancelled": return t("crmDetails.canceled");
    default: return status;
  }
}

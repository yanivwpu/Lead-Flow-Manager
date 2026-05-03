import {
  hubspotCreateContact,
  hubspotFetchContactPropertyNames,
  hubspotPatchContact,
  hubspotSearchContactByEmail,
  hubspotSearchContactByPhone,
} from "./hubspotApi";

export type HubSpotLeadRow = {
  email?: string;
  phone?: string;
  name: string;
  pipelineStage?: string;
  tag?: string;
};

export type HubSpotPushOutcome = {
  pushed: number;
  failed: number;
  skipped: number;
  errors: string[];
  summary: string;
};

const PIPELINE_PROP = "whachat_pipeline_stage";
const TAG_PROP = "whachat_tag";

export function splitNameForHubSpot(full: string): { firstname: string; lastname: string } {
  const t = full.trim();
  if (!t) return { firstname: "", lastname: "" };
  const i = t.indexOf(" ");
  if (i === -1) return { firstname: t.slice(0, 100), lastname: "" };
  return {
    firstname: t.slice(0, i).slice(0, 100),
    lastname: t.slice(i + 1).trim().slice(0, 100),
  };
}

/** E.164-style +digits for HubSpot phone fields (best-effort). */
export function normalizePhoneForHubSpot(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `+${digits}`;
}

/**
 * Upsert leads as HubSpot contacts. Skips rows with neither email nor dialable phone.
 * Optional custom properties are only sent if defined on the HubSpot account.
 */
export async function pushLeadsToHubSpot(
  token: string,
  leads: HubSpotLeadRow[]
): Promise<HubSpotPushOutcome> {
  const propertyNames = await hubspotFetchContactPropertyNames(token);
  const hasPipelineProp = propertyNames.has(PIPELINE_PROP);
  const hasTagProp = propertyNames.has(TAG_PROP);

  let pushed = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const pushError = (msg: string) => {
    if (errors.length < 25) errors.push(msg);
  };

  for (const lead of leads) {
    const email = lead.email?.trim().toLowerCase() || undefined;
    const phone = normalizePhoneForHubSpot(lead.phone);
    if (!email && !phone) {
      skipped++;
      continue;
    }

    let contactId: string | undefined;
    if (email) {
      contactId = await hubspotSearchContactByEmail(token, email);
    }
    if (!contactId && phone) {
      contactId = await hubspotSearchContactByPhone(token, phone);
    }

    const { firstname, lastname } = splitNameForHubSpot(
      lead.name || email || phone || "WhatsApp lead"
    );
    const properties: Record<string, string> = {};
    if (email) properties.email = email;
    if (phone) properties.phone = phone;
    if (firstname) properties.firstname = firstname;
    if (lastname) properties.lastname = lastname;

    if (hasPipelineProp && lead.pipelineStage?.trim()) {
      properties[PIPELINE_PROP] = lead.pipelineStage.trim().slice(0, 255);
    }
    if (hasTagProp && lead.tag?.trim()) {
      properties[TAG_PROP] = lead.tag.trim().slice(0, 255);
    }

    if (contactId) {
      const patch = await hubspotPatchContact(token, contactId, properties);
      if (patch.ok) pushed++;
      else {
        failed++;
        pushError(`Update failed${email ? ` (${email})` : phone ? ` (${phone})` : ""}: ${patch.message || patch.status}`);
      }
    } else {
      const created = await hubspotCreateContact(token, properties);
      if (created.ok) pushed++;
      else {
        failed++;
        pushError(`Create failed${email ? ` (${email})` : phone ? ` (${phone})` : ""}: ${created.message || created.status}`);
      }
    }

    // Light spacing to reduce burst 429s on large workspaces
    await new Promise((r) => setTimeout(r, 35));
  }

  const summary = `Synced ${pushed} contact(s) to HubSpot${skipped ? `, ${skipped} skipped (no email/phone)` : ""}${failed ? `, ${failed} failed` : ""}.`;
  return { pushed, failed, skipped, errors, summary };
}

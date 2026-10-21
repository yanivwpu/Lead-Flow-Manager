/** Structural cold-email checks. Factual claims still require human review
 * against the workspace and source evidence; these checks do not certify facts. */
export function prospectMarketingQualityIssues(subject: string, body: string): string[] {
  const issues: string[] = [];
  if (!subject.trim() || !body.trim()) issues.push("Subject and complete message are required");
  if (/[\r\n\0]/.test(subject)) issues.push("Subject must be a single line");
  if (/\{\{[^}]*\}\}/.test(subject + body)) issues.push("Resolve all personalization fields");
  if (/^(?:re|fw|fwd):/i.test(subject.trim()) || /\b(?:as we discussed|following up on our conversation|great speaking with you)\b/i.test(body)) issues.push("Remove unsupported prior-conversation claims");
  if (/\b(?:looking forward to discussing|would love to|happy to|and|with|because)\s*[.!]?\s*$/i.test(body.trim())) issues.push("Complete the final sentence");
  // Question marks in URLs are not calls to action.
  const withoutUrls = body.replace(/https?:\/\/\S+/g, "");
  if ((withoutUrls.match(/[?؟]/g) || []).length > 1) issues.push("Use one clear call to action");
  return issues;
}

/** UI-only defaults for Sales Admin Activation collapsible sections. */

export const ACTIVATION_SECTION_DEFAULT_OPEN = {
  channels: true,
  usage: true,
  funnel: true,
  unmatchedGhl: false,
  accounts: true,
} as const;

export type ActivationSectionKey = keyof typeof ACTIVATION_SECTION_DEFAULT_OPEN;

export function formatActivationSectionCount(count: number, unit?: string): string {
  if (unit) return `(${count.toLocaleString()} ${unit})`;
  return `(${count.toLocaleString()})`;
}

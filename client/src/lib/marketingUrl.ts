const DEFAULT_MARKETING_URL = "https://www.whachatcrm.com";

export const MARKETING_URL =
  (import.meta.env.VITE_MARKETING_URL as string | undefined)?.replace(/\/+$/, "") ||
  DEFAULT_MARKETING_URL;

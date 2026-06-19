export function buildAgentPageListingFullAddress(parts: {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  const cityState = [parts.city, parts.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, parts.zip?.trim()].filter(Boolean).join(" ");
  if (parts.street?.trim()) return `${parts.street.trim()}, ${cityStateZip}`;
  return cityStateZip;
}

export function buildAgentPageListingMetaSummary(parts: {
  price: string;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
}): string {
  return [parts.price, parts.beds, parts.baths, parts.sqft].filter(Boolean).join(" • ");
}

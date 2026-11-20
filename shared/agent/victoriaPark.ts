export const VICTORIA_PARK_AGENT_SLUG = "yaniv-haramatiy";
export const VICTORIA_PARK_SLUG = "victoria-park";
export const VICTORIA_PARK_NAME = "Victoria Park";
export const VICTORIA_PARK_TITLE = "Victoria Park, Fort Lauderdale";
export const VICTORIA_PARK_CITY_GUIDE = "https://www.fortlauderdale.gov/Government/Departments/Development-Services/Urban-Design-and-Planning/Historic-Preservation/Architectural-Resource-Surveys/Victoria-Park";

export const VICTORIA_PARK_DRAFT = `Victoria Park is in northeast Fort Lauderdale. The city’s architectural survey describes the neighborhood as the area between North Federal Highway and the Karen Canal, with NE 10th Street and East Broward Boulevard at its north and south edges.

Victoria Courts is a smaller area within Victoria Park. The city’s survey highlights buildings along NE 17th Avenue and 17th Road between NE 7th and NE 8th streets. If you are considering a renovation, check the city’s historic preservation records for the specific address before making plans.

If you are comparing homes, visit the blocks you are considering at the times you typically travel. Bring a short list of priorities, such as parking, outdoor space, and maintenance, to a showing. Sellers can request a property-specific valuation and share any recent improvements that may be relevant.`;

export function victoriaParkContentComplete(content: string): boolean {
  const paragraphs = content.trim().split(/\n\s*\n/).filter((part) => part.trim().length >= 60);
  return content.trim().length >= 240 && paragraphs.length >= 2;
}

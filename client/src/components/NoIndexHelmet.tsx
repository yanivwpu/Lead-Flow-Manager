import { Helmet } from "react-helmet";

/** Prevents search indexing for auth, portals, embeds, and other non-marketing routes. */
export function NoIndexHelmet() {
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}

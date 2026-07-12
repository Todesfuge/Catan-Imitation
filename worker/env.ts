export type Env = Cloudflare.Env & {
  /** Present only in the isolated local E2E Wrangler configuration. */
  CATAN_E2E_DETERMINISTIC?: "room-version-v1";
};

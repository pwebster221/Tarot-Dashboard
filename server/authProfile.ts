import neo4j, { Driver } from "neo4j-driver";
import type { TokenPayload } from "./oidc.ts";

export const UPSERT_USER_CYPHER = `
  MERGE (u:User {sub: $sub})
    ON CREATE SET u.email = $email, u.display_name = $name,
                  u.role = 'practitioner', u.created_at = datetime()
    ON MATCH  SET u.email = $email, u.last_seen_at = datetime()
  RETURN u.sub AS sub, u.email AS email, u.role AS role`;

let _driver: Driver | null = null;
function getDriver(): Driver {
  if (!_driver) {
    const uri = process.env.NEO4J_READINGS_URI as string;
    const user = (process.env.NEO4J_READINGS_USER ?? "neo4j") as string;
    const password = (process.env.NEO4J_READINGS_PASSWORD ?? "") as string;
    _driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return _driver;
}

/** Provision/refresh the User node on the readings graph (:7687) so HAS_READING
 *  links and sub-scoping have an anchor. Best-effort: callers should not let a
 *  failure here break the auth flow (the callback logs and continues). */
export async function upsertUser(claims: TokenPayload): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(UPSERT_USER_CYPHER, { sub: claims.sub, email: claims.email, name: claims.name });
  } finally {
    await session.close();
  }
}

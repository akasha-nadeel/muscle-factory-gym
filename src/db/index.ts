import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// `prepare: false` is required when DATABASE_URL points at Supabase's
// pgbouncer transaction-mode pooler — that pooler doesn't support prepared
// statements. Harmless on a direct connection.
const client = postgres(url, { prepare: false });

export const db = drizzle(client, { schema });

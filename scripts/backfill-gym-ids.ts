import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false });
  try {
    const missing = await sql<
      { id: string; full_name: string; email: string; created_at: Date }[]
    >`
      SELECT id, full_name, email, created_at
      FROM profiles
      WHERE gym_id IS NULL
        AND role = 'member'
        AND status = 'active'
      ORDER BY created_at ASC
    `;

    if (missing.length === 0) {
      console.log("Nothing to backfill — all active members already have a gym_id.");
      return;
    }

    const [{ max_id }] = await sql<{ max_id: number | null }[]>`
      SELECT MAX(gym_id) AS max_id FROM profiles
    `;
    let nextId = (max_id ?? 999) + 1;

    console.log(`Found ${missing.length} member(s) to backfill. Starting at gym_id=${nextId}.`);
    for (const m of missing) {
      console.log(`  ${nextId} → ${m.full_name} (${m.email})`);
      await sql`UPDATE profiles SET gym_id = ${nextId} WHERE id = ${m.id}`;
      nextId++;
    }
    console.log("Done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

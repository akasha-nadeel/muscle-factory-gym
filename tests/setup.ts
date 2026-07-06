import { config } from "dotenv";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// SAFETY GUARD — never let the test suite run against the production database.
//
// Much of this suite writes to a live Postgres, and some of it is NOT scoped
// to test fixtures: tests/lib/cron-wipe.test.ts runs `_wipeStaleMembersUnsafe`
// (a table-wide PII wipe that also deletes Supabase Storage files) and
// tests/lib/cron-expire.test.ts runs a table-wide status UPDATE. If
// DATABASE_URL ever points at the production Supabase project, `npm test`
// would irreversibly mutate/destroy real member data. Fail closed if we
// detect a known production project ref in either DB URL.
//
// When adding a new prod/staging DB that must never be tested against, add
// its Supabase project ref here.
// ---------------------------------------------------------------------------
const PRODUCTION_DB_REFS = [
  "dybiojmzrxjndeszrxhn", // musclefactorygym.lk — client production Supabase project
];

const dbUrls = [process.env.DATABASE_URL, process.env.DIRECT_DATABASE_URL];
for (const ref of PRODUCTION_DB_REFS) {
  if (dbUrls.some((url) => url?.includes(ref))) {
    throw new Error(
      `\n\n[tests] REFUSING TO RUN — DATABASE_URL points at a known PRODUCTION ` +
        `database (Supabase project "${ref}").\n` +
        `This suite writes to and wipes rows on the connected DB; running it ` +
        `against production would destroy real member data.\n` +
        `Point .env.local at a dedicated dev/test Supabase project and re-run.\n`,
    );
  }
}

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const { plans } = await import("./schema");

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  const existing = await db.select().from(plans);
  if (existing.length > 0) {
    console.log("Plans already seeded, skipping.");
    await client.end();
    return;
  }
  await db.insert(plans).values([
    { name: "Daily Pass", durationDays: 1, priceLkr: "500.00" },
    { name: "Monthly", durationDays: 30, priceLkr: "5000.00" },
    { name: "Annual", durationDays: 365, priceLkr: "50000.00" },
  ]);
  console.log("Seeded 3 plans.");
  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

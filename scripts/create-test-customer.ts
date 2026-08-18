/**
 * Create Test Customer for VA Testing
 * Creates a prospecting with customer data for demo
 */

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL || "file:/Users/nakiasuryanto/Documents/Dev/app-bca/prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Creating test customer for VA testing...\n");

  // Create a new prospecting (customer) with status 'Closing'
  const customer = await prisma.prospecting.create({
    data: {
      status: "Closing",
      instansi_ub: "PT Digital Indonesia Sejahtera",
      kontak_nama: "Budi Santoso",
      kontak_telepon: "081234567890",
    },
  });

  console.log("✅ Customer created successfully!\n");
  console.log("Customer Details:");
  console.log("================");
  console.log(`ID:          ${customer.id}`);
  console.log(`Name:        ${customer.kontak_nama}`);
  console.log(`Phone:       ${customer.kontak_telepon}`);
  console.log(`Company:     ${customer.instansi_ub}`);
  console.log(`Status:      ${customer.status}`);
  console.log(`Created:     ${customer.created_at}`);
  console.log("");
  console.log("📋 Ready for VA Testing!");
  console.log("========================");
  console.log(`Use prospectingId: ${customer.id} to create VA`);
  console.log("");
  console.log("Example curl:");
  console.log(`curl -X POST http://localhost:3000/api/va/create \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-API-Key: dev-test-key-change-in-production" \\`);
  console.log(`  -d '{"prospectingId": ${customer.id}, "amount": 2500000, "unitBisnisId": "01"}'`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

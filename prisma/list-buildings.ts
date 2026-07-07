import "dotenv/config";
import prisma from "../src/lib/prisma";

async function main() {
  const buildings = await prisma.building.findMany();
  console.log("Buildings in database:");
  for (const b of buildings) {
    console.log(`- ID: "${b.id}" | Code: "${b.code}" | Name: "${b.name}"`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

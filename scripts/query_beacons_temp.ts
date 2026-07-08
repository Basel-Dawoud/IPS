import prisma from "../src/lib/prisma";

async function main() {
  const buildingId = "cmpwk59uz00000kpagwc05v2s";
  const floorLevel = 3;

  const beacons = await prisma.bleBeacon.findMany({
    where: {
      buildingId,
      floorLevel,
    },
  });

  console.log(`Found ${beacons.length} beacons for floor ${floorLevel}:`);
  for (const b of beacons) {
    console.log(`- UID: ${b.beaconUid}, Major: ${b.major}, Minor: ${b.minor}, X: ${b.x}, Y: ${b.y}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

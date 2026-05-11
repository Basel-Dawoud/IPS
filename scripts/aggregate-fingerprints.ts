/**
 * Script to aggregate all existing BleFingerprint data into AggregatedFingerprint
 * This handles fingerprints that may not have a session assigned
 */
import prisma from "../src/lib/prisma";

async function main() {
  console.log("Starting fingerprint aggregation...\n");

  // Get all unique building + floor combinations from BleFingerprint
  const buildings = await prisma.bleFingerprint.groupBy({
    by: ["buildingId", "floorLevel"],
  });

  console.log(
    `Found ${buildings.length} building/floor combinations with fingerprints\n`
  );

  let totalPointsCreated = 0;
  let totalPointsUpdated = 0;

  for (const { buildingId, floorLevel } of buildings) {
    console.log(`\nProcessing buildingId: ${buildingId}, floor: ${floorLevel}`);

    // Get all fingerprints for this building/floor
    const fingerprints = await prisma.bleFingerprint.findMany({
      where: { buildingId, floorLevel },
    });

    console.log(`  Found ${fingerprints.length} raw fingerprints`);

    // Group by (x, y) position
    const pointGroups = new Map<
      string,
      { x: number; y: number; samples: Array<{ beaconUids: string[]; rssis: number[] }> }
    >();

    for (const fp of fingerprints) {
      const key = `${fp.x},${fp.y}`;
      if (!pointGroups.has(key)) {
        pointGroups.set(key, { x: fp.x, y: fp.y, samples: [] });
      }
      pointGroups.get(key)!.samples.push({
        beaconUids: fp.beaconUids,
        rssis: fp.rssis,
      });
    }

    console.log(`  Grouped into ${pointGroups.size} unique grid points`);

    let pointsCreated = 0;
    let pointsUpdated = 0;

    // Process each grid point
    for (const [_, point] of pointGroups) {
      // Collect all beacons seen at this point
      const beaconRssiMap = new Map<string, number[]>();

      for (const sample of point.samples) {
        for (let i = 0; i < sample.beaconUids.length; i++) {
          const uid = sample.beaconUids[i];
          const rssi = sample.rssis[i];
          if (!beaconRssiMap.has(uid)) {
            beaconRssiMap.set(uid, []);
          }
          beaconRssiMap.get(uid)!.push(rssi);
        }
      }

      // Calculate mean and std dev for each beacon
      const beaconUids: string[] = [];
      const rssiMeans: number[] = [];
      const rssiStdDevs: number[] = [];

      for (const [uid, rssiValues] of beaconRssiMap) {
        beaconUids.push(uid);

        // Mean
        const mean = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
        rssiMeans.push(mean);

        // Std deviation
        const variance =
          rssiValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          rssiValues.length;
        rssiStdDevs.push(Math.sqrt(variance));
      }

      // Upsert aggregated fingerprint
      const existing = await prisma.aggregatedFingerprint.findUnique({
        where: {
          buildingId_floorLevel_gridX_gridY: {
            buildingId,
            floorLevel,
            gridX: point.x,
            gridY: point.y,
          },
        },
      });

      if (existing) {
        await prisma.aggregatedFingerprint.update({
          where: { id: existing.id },
          data: {
            beaconUids,
            rssiMeans,
            rssiStdDevs,
            sampleCount: point.samples.length,
          },
        });
        pointsUpdated++;
      } else {
        await prisma.aggregatedFingerprint.create({
          data: {
            buildingId,
            floorLevel,
            gridX: point.x,
            gridY: point.y,
            beaconUids,
            rssiMeans,
            rssiStdDevs,
            sampleCount: point.samples.length,
          },
        });
        pointsCreated++;
      }
    }

    console.log(`  Created: ${pointsCreated}, Updated: ${pointsUpdated}`);
    totalPointsCreated += pointsCreated;
    totalPointsUpdated += pointsUpdated;
  }

  console.log("\n========================================");
  console.log("AGGREGATION COMPLETE");
  console.log(`Total grid points created: ${totalPointsCreated}`);
  console.log(`Total grid points updated: ${totalPointsUpdated}`);
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

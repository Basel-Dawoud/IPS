import { Router } from "express";
import * as FingerprintingController from "./fingerprinting.controller";

const router = Router();

/**
 * Session Management
 */

router.post("/sessions", FingerprintingController.createSession);

router.get("/sessions/:buildingId", FingerprintingController.getSessions);

router.get("/session/:id", FingerprintingController.getSession);

router.patch("/session/:id", FingerprintingController.updateSession);

router.delete("/session/:id", FingerprintingController.deleteSession);

/**
 * Fingerprint Data
 */

router.post("/session/:id/fingerprints", FingerprintingController.uploadFingerprints);

router.get("/session/:id/fingerprints", FingerprintingController.getFingerprints);

router.get("/session/:id/export", FingerprintingController.exportFingerprints);

router.get("/session/:id/export-raw", FingerprintingController.exportRawReadings);

router.delete("/session/:id/point", FingerprintingController.deleteSessionPoint);

router.delete("/session/:id/fingerprint/:fingerprintId", FingerprintingController.deleteFingerprint);

router.get("/session/:id/analytics", FingerprintingController.getSessionAnalytics);

/**
 * Aggregation & Radio Map
 */

router.post("/session/:id/aggregate", FingerprintingController.aggregateFingerprints);

router.get("/buildings/:buildingId/radio-map", FingerprintingController.getRadioMap);

export default router;

import { Request, Response, NextFunction } from "express";
import * as FingerprintingService from "./fingerprinting.service";

export const createSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await FingerprintingService.createSession(req.body);
    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const getSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId } = req.params;
    const { floorLevel, status } = req.query;

    const sessions = await FingerprintingService.getSessionsByBuilding(
      buildingId,
      floorLevel !== undefined ? Number(floorLevel) : undefined,
      status as string | undefined
    );

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
};

export const getSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await FingerprintingService.getSessionById(id);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await FingerprintingService.updateSession(id, req.body);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await FingerprintingService.deleteSession(id);

    res.json({
      success: true,
      message: "Session deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const uploadFingerprints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await FingerprintingService.uploadFingerprints({
      sessionId: id,
      ...req.body,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getFingerprints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query;

    const result = await FingerprintingService.getFingerprintsBySession(
      id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 100
    );

    res.json({
      success: true,
      data: result.fingerprints,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const aggregateFingerprints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const result = await FingerprintingService.aggregateFingerprints(id);

    res.json({
      success: true,
      data: result,
      message: `Aggregated ${result.pointsProcessed} points (${result.pointsCreated} created, ${result.pointsUpdated} updated)`,
    });
  } catch (error) {
    next(error);
  }
};

export const getRadioMap = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId } = req.params;
    const { floorLevel } = req.query;

    const radioMap = await FingerprintingService.getRadioMap(
      buildingId,
      floorLevel !== undefined ? Number(floorLevel) : undefined
    );

    res.json({
      success: true,
      data: radioMap,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Converts a session name (or fallback string) into a safe filename stem.
 * e.g. "Hallway A — Floor 2!" → "hallway-a-floor-2"
 */
function toFileStem(name: string | null | undefined, fallback: string): string {
  const base = (name && name.trim()) ? name.trim() : fallback;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace any run of non-alphanumeric with a dash
    .replace(/^-+|-+$/g, "");    // strip leading/trailing dashes
}

export const exportFingerprints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const [csv, session] = await Promise.all([
      FingerprintingService.exportFingerprintsCSV(id),
      FingerprintingService.getSessionById(id),
    ]);

    const stem = toFileStem(session?.name, "session");
    const shortId = id.slice(0, 8);
    const filename = `fingerprints-${stem}-${shortId}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const exportRawReadings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const [csv, session] = await Promise.all([
      FingerprintingService.exportRawReadingsCSV(id),
      FingerprintingService.getSessionById(id),
    ]);

    const stem = toFileStem(session?.name, "session");
    const shortId = id.slice(0, 8);
    const filename = `raw-readings-${stem}-${shortId}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const exportWifiReadings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const [csv, session] = await Promise.all([
      FingerprintingService.exportWifiReadingsCSV(id),
      FingerprintingService.getSessionById(id),
    ]);

    const stem = toFileStem(session?.name, "session");
    const shortId = id.slice(0, 8);
    const filename = `wifi-readings-${stem}-${shortId}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const deleteSessionPoint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const x = parseFloat(String(req.query.x));
    const y = parseFloat(String(req.query.y));
    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({ success: false, error: "x and y query params required" });
    }
    const result = await FingerprintingService.deleteSessionPoint(id, x, y);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const deleteFingerprint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, fingerprintId } = req.params;
    const result = await FingerprintingService.deleteSessionFingerprint(id, fingerprintId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getSessionAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const analytics = await FingerprintingService.getSessionAnalytics(id);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

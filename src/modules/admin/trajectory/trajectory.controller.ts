import { Request, Response, NextFunction } from "express";
import * as TrajectoryService from "./trajectory.service";
import { uploadWalksSchema } from "./trajectory.schema";
import { sendValidationError } from "../../../utils/response";

export const createSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await TrajectoryService.createSession(req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

export const listSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, floorLevel, status } = req.query;
    const sessions = await TrajectoryService.listSessions(
      buildingId as string | undefined,
      floorLevel !== undefined ? Number(floorLevel) : undefined,
      status as string | undefined
    );
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
};

export const getSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await TrajectoryService.getSessionById(id);
    if (!session) {
      return res.status(404).json({ success: false, error: "Trajectory session not found" });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

export const updateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const session = await TrajectoryService.updateSession(id, req.body);
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};

export const deleteSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await TrajectoryService.deleteSession(id);
    res.json({ success: true, message: "Trajectory session deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const uploadWalks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { params, body } = uploadWalksSchema.parse({
      params: req.params,
      body: req.body,
    });
    const result = await TrajectoryService.uploadWalks({
      sessionId: params.id,
      ...body,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    next(error);
  }
};

export const exportSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const result = await TrajectoryService.exportSession(
      id,
      typeof cursor === "string" ? cursor : undefined,
      limit ? Math.min(Number(limit), 100) : undefined
    );
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * Replay tape (B3): per-walk anchor polyline + a single time-ordered event
 * array, each event labelled with its on-the-fly (x, y). The AI engineer
 * replays this offline against a trained model to score positioning accuracy.
 */
export const replaySession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const result = await TrajectoryService.replaySession(
      id,
      typeof cursor === "string" ? cursor : undefined,
      limit ? Math.min(Number(limit), 100) : undefined
    );
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

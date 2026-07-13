import { Request, Response } from "express";
import path from "path";
import sharp from "sharp";
import prisma from "../../../lib/prisma";
import {
  sendSuccess,
  sendBadRequest,
  sendServerError,
} from "../../../utils/response";
import { AVATARS_UPLOAD_DIR, publicUrlForAvatar } from "../../../lib/upload";
import { updateProfileSchema, createFeedbackSchema } from "./user.schema";

/** Shape the app expects from /auth/me — kept in sync so refreshMe reads cleanly. */
function toPublicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    interests: u.interests ? u.interests.map((cat: any) => cat.name) : [],
    onboardingComplete: u.onboardingComplete ?? false,
    age: u.age ?? null,
    gender: u.gender ?? null,
    needsStepFree: u.needsStepFree ?? false,
    shareWithFriends: u.shareWithFriends ?? true,
    hasPassword: !!u.passwordHash,
  };
}

export const getCategories = async (req: Request, res: Response) => {
  try {
    // Onboarding interests = the top-level categories only (parentId null);
    // the granular sub-categories are used for products, not interests.
    const categories = await prisma.poiCategory.findMany({
      where: { parentId: null },
      orderBy: { name: "asc" },
    });
    return sendSuccess(res, categories);
  } catch (error: any) {
    console.error("[user.controller] getCategories error:", error);
    return sendServerError(res, "Failed to fetch category options");
  }
};

export const saveInterests = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { categoryIds, age, gender, needsStepFree } = req.body;
    if (!Array.isArray(categoryIds)) {
      return sendBadRequest(res, "categoryIds must be an array of category IDs");
    }

    // Update user interests, age, gender, and set onboardingComplete = true
    const parsedAge = age ? parseInt(String(age), 10) : undefined;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        interests: {
          set: categoryIds.map((id: string) => ({ id })),
        },
        age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
        gender: typeof gender === "string" ? gender : undefined,
        needsStepFree: typeof needsStepFree === "boolean" ? needsStepFree : undefined,
        onboardingComplete: true,
      },
      include: { interests: true },
    });

    const categoryNames = user.interests.map((cat: any) => cat.name);

    return sendSuccess(res, {
      success: true,
      onboardingComplete: user.onboardingComplete,
      interests: categoryNames,
      age: user.age,
      gender: user.gender,
    });
  } catch (error: any) {
    console.error("[user.controller] saveInterests error:", error);
    return sendServerError(res, "Failed to save user interests");
  }
};

export const getRecentVisits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    // Pull the newest visits, then collapse to the most recent per POI.
    const visits = await prisma.poiVisit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        poi: {
          include: {
            building: true,
            categories: { select: { name: true, parentId: true } },
          },
        },
      },
    });

    const seen = new Set<string>();
    const recent: any[] = [];
    for (const v of visits) {
      if (!v.poi || seen.has(v.poiId)) continue;
      seen.add(v.poiId);
      recent.push({
        poiId: v.poi.id,
        name: v.poi.name,
        code: v.poi.code,
        floorLevel: v.poi.floorLevel,
        x: v.poi.x,
        y: v.poi.y,
        buildingId: v.poi.buildingId,
        buildingName: v.poi.building?.name ?? null,
        categoryName:
          (v.poi.categories.find((c) => c.parentId) ?? v.poi.categories[0])?.name ?? null,
        visitedAt: v.createdAt,
      });
      if (recent.length >= 20) break;
    }

    return sendSuccess(res, recent);
  } catch (error: any) {
    console.error("[user.controller] getRecentVisits error:", error);
    return sendServerError(res, "Failed to fetch recent visits");
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues[0]?.message ?? "Invalid profile data");
    }
    const { name, age, gender, needsStepFree, shareWithFriends } = parsed.data;

    // Only touch fields the client actually sent.
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (age !== undefined) data.age = age;
    if (gender !== undefined) data.gender = gender;
    if (needsStepFree !== undefined) data.needsStepFree = needsStepFree;
    if (shareWithFriends !== undefined) data.shareWithFriends = shareWithFriends;

    if (Object.keys(data).length === 0) {
      return sendBadRequest(res, "No profile fields provided");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      include: { interests: true },
    });

    return sendSuccess(res, toPublicUser(user));
  } catch (error: any) {
    console.error("[user.controller] updateProfile error:", error);
    return sendServerError(res, "Failed to update profile");
  }
};

export const uploadAvatar = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    if (!req.file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'image')");
    }

    // Square-crop to a small WebP avatar.
    const filename = `${userId}-${Date.now()}.webp`;
    await sharp(req.file.buffer)
      .resize(256, 256, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(AVATARS_UPLOAD_DIR, filename));

    const avatarUrl = publicUrlForAvatar(filename);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      include: { interests: true },
    });

    return sendSuccess(res, toPublicUser(user));
  } catch (error: any) {
    console.error("[user.controller] uploadAvatar error:", error);
    return sendServerError(res, "Failed to upload avatar");
  }
};

export const clearRecentVisits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    await prisma.$transaction([
      prisma.poiVisit.deleteMany({ where: { userId } }),
      prisma.buildingVisit.deleteMany({ where: { userId } }),
    ]);

    return sendSuccess(res, { success: true });
  } catch (error: any) {
    console.error("[user.controller] clearRecentVisits error:", error);
    return sendServerError(res, "Failed to clear visit history");
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    // Cascades remove identities, visits, reviews and chat sessions.
    await prisma.user.delete({ where: { id: userId } });

    return sendSuccess(res, { success: true });
  } catch (error: any) {
    console.error("[user.controller] deleteAccount error:", error);
    return sendServerError(res, "Failed to delete account");
  }
};

export const skipOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { age, gender, needsStepFree } = req.body;
    const parsedAge = age ? parseInt(String(age), 10) : undefined;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        interests: {
          set: [], // Clear interests if any
        },
        age: parsedAge && !isNaN(parsedAge) ? parsedAge : undefined,
        gender: typeof gender === "string" ? gender : undefined,
        needsStepFree: typeof needsStepFree === "boolean" ? needsStepFree : undefined,
        onboardingComplete: true,
      },
    });

    return sendSuccess(res, {
      success: true,
      onboardingComplete: user.onboardingComplete,
      interests: [],
      age: user.age,
      gender: user.gender,
    });
  } catch (error: any) {
    console.error("[user.controller] skipOnboarding error:", error);
    return sendServerError(res, "Failed to skip onboarding");
  }
};

export const createFeedback = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const result = createFeedbackSchema.safeParse(req.body);
    if (!result.success) {
      return sendBadRequest(res, result.error.issues[0]?.message || "Invalid input");
    }

    const { type, description } = result.data;

    const feedback = await prisma.userFeedback.create({
      data: {
        userId,
        type,
        description,
      },
    });

    return sendSuccess(res, feedback);
  } catch (error: any) {
    console.error("[user.controller] createFeedback error:", error);
    return sendServerError(res, "Failed to submit feedback");
  }
};

import { Router } from "express";
import * as internalUsersController from "./internal-users.controller";
import { requireInternalAuth, requirePermission } from "../../../middleware/internal-auth";

const router = Router();

router.use(requireInternalAuth, requirePermission("internal-users:manage"));

router.get("/roles", internalUsersController.listRoles);
router.post("/roles", internalUsersController.createRole);
router.get("/permissions", internalUsersController.listPermissions);
router.get("/", internalUsersController.listUsers);
router.post("/", internalUsersController.grantRole);
router.get("/:id", internalUsersController.getUser);
router.patch("/:id", internalUsersController.updateRole);
router.post("/:id/revoke", internalUsersController.revokeRole);

export default router;

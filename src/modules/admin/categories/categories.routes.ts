import { Router } from "express";
import * as controller from "./categories.controller";

const router = Router();

// Admin CRUD for the 2-level taxonomy tree (categories + sub-categories).
router.get("/", controller.list);
router.post("/", controller.create);
router.patch("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;

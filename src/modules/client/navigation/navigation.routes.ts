import { Router } from "express";
import * as navigationController from "./navigation.controller";

const router = Router();

router.post("/route", navigationController.getRoute);

export default router;

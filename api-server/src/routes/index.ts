import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kommoRouter from "./kommo";
import lucyRouter from "./lucy";
import examplesRouter from "./examples";
import analyticsRouter from "./analytics";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(examplesRouter);
router.use(kommoRouter);
router.use(lucyRouter);
router.use(analyticsRouter);
router.use(authRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kommoRouter from "./kommo";
import lucyRouter from "./lucy";
import examplesRouter from "./examples";
import analyticsRouter from "./analytics";
import authRouter from "./auth";
import learningRouter from "./learning";

const router: IRouter = Router();

// Rutas públicas primero (webhook, simulador, login). Los routers con
// router.use(requireAuth) bloquean TODO lo que venga después si van antes.
router.use(healthRouter);
router.use(kommoRouter);
router.use(lucyRouter);
router.use(authRouter);
router.use(examplesRouter);
router.use(learningRouter);
router.use(analyticsRouter);

export default router;

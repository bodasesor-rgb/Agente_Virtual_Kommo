import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kommoRouter from "./kommo";
import lucyRouter from "./lucy";
import examplesRouter from "./examples";
import analyticsRouter from "./analytics";
import authRouter from "./auth";
import learningRouter from "./learning";
import knowledgeGapsRouter from "./knowledgeGaps";
import lucyInfoRouter from "./lucyInfo";
import catalogRouter from "./catalog";
import opsRouter from "./ops";

const router: IRouter = Router();

// Rutas públicas primero (webhook, simulador, panel, ops). Los routers con
// router.use(requireAuth) sin path aplican auth a TODA petición que pase por
// ellos — si van antes, bloquean knowledge-gaps/ops/aprendizaje con 401.
router.use(healthRouter);
router.use(catalogRouter);
router.use(kommoRouter);
router.use(lucyRouter);
router.use(authRouter);
router.use(knowledgeGapsRouter);
router.use(lucyInfoRouter);
// learning ANTES de examples/analytics: tiene GET públicos del panel /aprendizaje.
router.use(learningRouter);
router.use(opsRouter);
router.use(examplesRouter);
router.use(analyticsRouter);

export default router;

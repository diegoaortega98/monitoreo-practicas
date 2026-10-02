import { Router } from "express";
import { marcarEntrada, marcarSalida } from "../controllers/asistenciaController.js";

const router = Router();

// Reenvía los errores asíncronos de marcación al middleware de Express.
function manejarAsync(controlador) {
  return (req, res, next) => {
    Promise.resolve(controlador(req, res, next)).catch(next);
  };
}

router.post("/entrada", manejarAsync(marcarEntrada));
router.post("/salida", manejarAsync(marcarSalida));

export default router;

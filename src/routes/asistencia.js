import { Router } from "express";
import {
  crearActividadPractica,
  editarActividadPractica,
  enviarJornada,
  firmarEvidenciaPractica,
  guardarEvidenciaPractica,
  obtenerJornadaPractica,
} from "../controllers/activitiesController.js";
import { marcarEntrada } from "../controllers/asistenciaController.js";

const router = Router();

// Reenvía los errores asíncronos de marcación al middleware de Express.
function manejarAsync(controlador) {
  return (req, res, next) => {
    Promise.resolve(controlador(req, res, next)).catch(next);
  };
}

router.post("/entrada", manejarAsync(marcarEntrada));
router.get("/jornada", manejarAsync(obtenerJornadaPractica));
router.post("/actividades", manejarAsync(crearActividadPractica));
router.put("/actividades/:id", manejarAsync(editarActividadPractica));
router.post("/actividades/:id/evidencias/firma", manejarAsync(firmarEvidenciaPractica));
router.post("/actividades/:id/evidencias", manejarAsync(guardarEvidenciaPractica));
router.post("/salida", manejarAsync(enviarJornada));

export default router;

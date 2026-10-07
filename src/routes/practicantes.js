import { Router } from "express";
import {
  actualizarPracticante,
  crearPracticante,
  eliminarPracticante,
  listarPracticantes,
  obtenerPracticante,
  obtenerProgreso,
  registrarPracticantePublico,
  registrarHoras,
} from "../controllers/practicantesController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// Adapta promesas async al middleware de errores de Express 4.
function manejarAsync(controlador) {
  return (req, res, next) => {
    Promise.resolve(controlador(req, res, next)).catch(next);
  };
}

router.post("/registro", manejarAsync(registrarPracticantePublico));
router.use(requireAdmin);
router.post("/", manejarAsync(crearPracticante));
router.get("/", manejarAsync(listarPracticantes));
router.get("/:id/progreso", manejarAsync(obtenerProgreso));
router.post("/:id/horas", manejarAsync(registrarHoras));
router.get("/:id", manejarAsync(obtenerPracticante));
router.put("/:id", manejarAsync(actualizarPracticante));
router.delete("/:id", manejarAsync(eliminarPracticante));

export default router;

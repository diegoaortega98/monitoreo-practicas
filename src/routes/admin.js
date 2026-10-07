import { Router } from "express";
import {
  aprobarPracticante,
  actualizarAsistencia,
  crearAsistenciaManual,
  eliminarAsistencia,
  listarAsistencias,
  loginAdmin,
  logoutAdmin,
  meAdmin,
  rechazarPracticante,
} from "../controllers/adminController.js";
import {
  actualizarPracticante,
  crearPracticante,
  eliminarPracticante,
  listarPracticantes,
  obtenerPracticante,
} from "../controllers/practicantesController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// Reenvía los errores asíncronos al middleware central de Express.
function manejarAsync(controlador) {
  return (req, res, next) => {
    Promise.resolve(controlador(req, res, next)).catch(next);
  };
}

router.post("/login", manejarAsync(loginAdmin));
router.use(requireAdmin);
router.get("/me", manejarAsync(meAdmin));
router.post("/logout", manejarAsync(logoutAdmin));
router.get("/practicantes", manejarAsync(listarPracticantes));
router.post("/practicantes", manejarAsync(crearPracticante));
router.patch("/practicantes/:id/aprobar", manejarAsync(aprobarPracticante));
router.patch("/practicantes/:id/rechazar", manejarAsync(rechazarPracticante));
router.get("/practicantes/:id", manejarAsync(obtenerPracticante));
router.put("/practicantes/:id", manejarAsync(actualizarPracticante));
router.delete("/practicantes/:id", manejarAsync(eliminarPracticante));
router.get("/asistencias", manejarAsync(listarAsistencias));
router.post("/practicantes/:id/asistencias", manejarAsync(crearAsistenciaManual));
router.patch(
  "/asistencias/:practicanteId/:asistenciaId",
  manejarAsync(actualizarAsistencia),
);
router.delete(
  "/asistencias/:practicanteId/:asistenciaId",
  manejarAsync(eliminarAsistencia),
);

export default router;

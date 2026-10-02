import { obtenerSesionAdmin } from "../services/adminAuth.js";

// Protege endpoints y adjunta la sesión del administrador autenticado.
export function requireAdmin(req, _res, next) {
  obtenerSesionAdmin(req).then((sesion) => {
    if (!sesion) {
      const error = new Error("Inicia sesión como administrador para continuar.");
      error.status = 401;
      next(error);
      return;
    }
    req.admin = { usuario: sesion.usuario, expiraEn: sesion.expiraEn };
    next();
  }).catch(next);
}

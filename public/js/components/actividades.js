import { api } from "../api.js";
import { button, el, formatDate } from "../utils.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { createEmptyState } from "./practicantes.js";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const MAX_EVIDENCES = 10;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
]);

export function renderActivities({ activities, onReview }) {
  const section = el("section", "tab-panel");
  const pendingCount = activities.filter((activity) => activity.estado === "en_revision").length;
  const header = el("div", "activity-review-summary");
  header.append(
    el("h2", "", "Revisión de actividades"),
    el("p", "", `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} de revisión`),
  );
  section.append(header);
  if (!activities.length) {
    section.append(createEmptyState(
      "Aún no hay actividades enviadas",
      "Las actividades aparecerán aquí cuando el practicante cierre y envíe su jornada.",
    ));
    return section;
  }

  const list = el("div", "activity-list");
  activities.forEach((activity) => {
    const card = el("article", "card activity-card");
    const heading = el("div", "activity-card__heading");
    const identity = el("div");
    identity.append(
      el("h3", "", activity.nombreCompleto),
      el("p", "", `${activity.documento} · Entrada ${formatDate(activity.horaEntrada)}`),
    );
    const statusLabel = activity.estado === "en_revision" ? "Pendiente" : activity.estado === "aprobada" ? "Aprobada" : "Observada";
    const statusVariant = activity.estado === "en_revision" ? "warning" : activity.estado === "aprobada" ? "success" : "danger";
    heading.append(identity, badgeElement(statusLabel, statusVariant));
    const content = el("div", "activity-card__content");
    content.append(el("p", "activity-card__description", activity.descripcion));
    if (activity.evidencias?.length) {
      const evidenceGrid = el("div", "evidence-grid");
      activity.evidencias.forEach((evidence) => evidenceGrid.append(renderEvidence(evidence)));
      content.append(evidenceGrid);
    } else {
      content.append(el("p", "field__message", "Sin evidencias adjuntas."));
    }
    if (activity.comentarioRevision) {
      content.append(el("p", "activity-review-note", `Comentario: ${activity.comentarioRevision}`));
    }
    if (activity.estado === "en_revision") {
      const actions = el("div", "inline-actions activity-card__actions");
      const approve = button("Aprobar", "primary", "sm");
      approve.addEventListener("click", () => onReview(activity, "aprobada"));
      const observe = button("Observar", "secondary", "sm");
      observe.addEventListener("click", () => onReview(activity, "observada"));
      actions.append(approve, observe);
      content.append(actions);
    }
    card.append(heading, content);
    list.append(card);
  });
  section.append(list);
  return section;
}

function badgeElement(label, variant) {
  const node = el("span", `badge badge--${variant}`, label);
  return node;
}

function renderEvidence(evidence) {
  const item = el("figure", "evidence-item");
  const link = document.createElement("a");
  link.href = evidence.secureUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `Abrir evidencia ${evidence.nombre || ""} en otra pestaña`);
  if (evidence.resourceType === "video") {
    const video = document.createElement("video");
    video.src = evidence.secureUrl;
    video.controls = true;
    video.preload = "metadata";
    link.append(video);
  } else {
    const image = document.createElement("img");
    image.src = evidence.secureUrl;
    image.alt = evidence.nombre || "Evidencia fotográfica";
    image.loading = "lazy";
    link.append(image);
  }
  item.append(link, el("figcaption", "", evidence.nombre || "Evidencia"));
  return item;
}

export async function showActivitySession({ documento, onFinish }) {
  const body = el("div", "activity-session");
  body.append(el("p", "field__message", "Cargando jornada..."));
  const finish = button("Enviar actividades y marcar salida", "primary");
  const footer = el("div", "inline-actions");
  footer.append(finish);
  const modal = openModal({
    title: "Actividades de la jornada",
    body,
    footer,
    className: "modal--wide",
  });
  let session;
  try {
    session = await api.openAttendanceSession(documento);
  } catch (error) {
    modal.close();
    toast(error.message, "error");
    return;
  }
  if (!session) {
    modal.close();
    toast("No tienes una jornada abierta. Marca la entrada antes de reportar actividades.", "warning");
    return;
  }

  const activities = session.actividades || [];
  let pendingOperations = 0;
  const setBusy = (busy) => {
    pendingOperations = Math.max(0, pendingOperations + (busy ? 1 : -1));
    finish.disabled = pendingOperations > 0;
  };
  body.replaceChildren(
    el("p", "field__message", `Jornada iniciada ${formatDate(session.registro.horaEntrada)}. Guarda cada actividad a medida que avanzas; el envío final también marcará tu salida.`),
  );
  const activityList = el("div", "activity-list");
  const newActivityForm = createActivityForm({
    documento,
    setBusy,
    onSaved: (activity) => {
      activities.push(activity);
      renderDrafts(activityList, activities, documento, setBusy);
    },
  });
  body.append(activityList, newActivityForm);
  renderDrafts(activityList, activities, documento, setBusy);
  finish.addEventListener("click", async () => {
    if (!activities.length) {
      toast("Crea al menos una actividad antes de marcar la salida.", "warning");
      return;
    }
    if (pendingOperations > 0) return;
    finish.disabled = true;
    finish.textContent = "Enviando...";
    try {
      const pendingDescription = newActivityForm.querySelector("textarea");
      const pendingFiles = newActivityForm.querySelector('input[type="file"]');
      if (pendingDescription.value.trim() || pendingFiles.files.length) {
        throw new Error("Guarda la actividad nueva antes de enviar la jornada.");
      }
      for (const activity of [...activities]) {
        const card = [...activityList.querySelectorAll("[data-activity-id]")]
          .find((item) => item.dataset.activityId === activity.id);
        if (!card) continue;
        const description = card.querySelector("textarea").value.trim();
        if (!description) throw new Error("Completa la descripción de cada actividad.");
        if (description !== activity.descripcion) {
          const updated = await api.updateActivity(activity.id, { documento, descripcion });
          replaceActivity(activities, updated);
        }
        const files = [...card.querySelector('input[type="file"]').files];
        validateSelectedFiles(files, activity.evidencias?.length || 0);
        if (files.length) {
          await uploadFiles(documento, activity, files, (updated) => {
            replaceActivity(activities, updated);
            renderDrafts(activityList, activities, documento, setBusy);
          });
        }
      }
      const result = await api.attendanceOut(documento);
      modal.close();
      await onFinish(result);
    } catch (error) {
      toast(error.message, error.status === 409 || error.status === 400 || !error.status ? "warning" : "error");
    } finally {
      if (finish.isConnected) {
        finish.disabled = false;
        finish.textContent = "Enviar actividades y marcar salida";
      }
    }
  });
}

function createActivityForm({ documento, setBusy, onSaved }) {
  const form = el("form", "card activity-editor");
  const title = el("h3", "", "Nueva actividad");
  const descriptionField = el("div", "field");
  const label = el("label", "", "¿Qué actividad realizaste?");
  const description = document.createElement("textarea");
  description.name = "descripcion";
  description.rows = 3;
  description.required = true;
  description.maxLength = 2000;
  description.placeholder = "Describe una tarea concreta que realizaste.";
  label.append(description);
  descriptionField.append(label);
  const evidenceInput = createEvidenceInput();
  const save = button("Guardar actividad", "primary");
  save.type = "submit";
  form.append(title, descriptionField, evidenceInput.wrapper, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!description.value.trim()) {
      description.setCustomValidity("Escribe una descripción para la actividad.");
      description.reportValidity();
      description.setCustomValidity("");
      return;
    }
    const files = [...evidenceInput.input.files];
    try {
      validateSelectedFiles(files, 0);
    } catch (error) {
      toast(error.message, "warning");
      return;
    }
    save.disabled = true;
    setBusy(true);
    try {
      const activity = await api.createActivity({ documento, descripcion: description.value.trim() });
      const saved = files.length
        ? await uploadFiles(documento, activity, files, () => {})
        : activity;
      onSaved(saved);
      form.reset();
      toast("Actividad guardada.", "success");
    } catch (error) {
      toast(error.message, "error");
      if (error.activity) {
        onSaved(error.activity);
        form.reset();
      }
    } finally {
      save.disabled = false;
      setBusy(false);
    }
  });
  return form;
}

function renderDrafts(container, activities, documento, setBusy) {
  container.replaceChildren();
  activities.forEach((activity, index) => {
    const card = el("article", "card activity-editor");
    card.dataset.activityId = activity.id;
    const heading = el("div", "activity-card__heading");
    heading.append(el("h3", "", `Actividad ${index + 1}`), badgeElement("Guardada", "success"));
    const field = el("div", "field");
    const label = el("label", "", "Descripción");
    const description = document.createElement("textarea");
    description.rows = 3;
    description.maxLength = 2000;
    description.value = activity.descripcion;
    label.append(description);
    field.append(label);
    const save = button("Guardar cambios", "secondary", "sm");
    save.addEventListener("click", async () => {
      if (!description.value.trim()) {
        toast("La descripción no puede estar vacía.", "warning");
        return;
      }
      save.disabled = true;
      setBusy(true);
      try {
        const updated = await api.updateActivity(activity.id, {
          documento,
          descripcion: description.value.trim(),
        });
        replaceActivity(activities, updated);
        toast("Actividad actualizada.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        save.disabled = false;
        setBusy(false);
      }
    });
    const evidenceInput = createEvidenceInput();
    const upload = button("Subir evidencias", "secondary", "sm");
    upload.addEventListener("click", async () => {
      const files = [...evidenceInput.input.files];
      try {
        validateSelectedFiles(files, activity.evidencias?.length || 0);
        if (!files.length) throw new Error("Selecciona al menos una foto o un video.");
        upload.disabled = true;
        setBusy(true);
        await uploadFiles(documento, activity, files, (updated) => {
          replaceActivity(activities, updated);
          renderDrafts(container, activities, documento, setBusy);
        });
        toast("Evidencias cargadas.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        upload.disabled = false;
        setBusy(false);
      }
    });
    const attachments = el("div", "evidence-grid");
    (activity.evidencias || []).forEach((evidence) => attachments.append(renderEvidence(evidence)));
    card.append(heading, field, save, evidenceInput.wrapper, upload);
    if (activity.evidencias?.length) card.append(attachments);
    container.append(card);
  });
}

function createEvidenceInput() {
  const wrapper = el("div", "field");
  const label = el("label", "", "Fotos o videos (opcional; máximo 10 por actividad)");
  const input = document.createElement("input");
  input.type = "file";
  input.name = "evidencias";
  input.accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";
  input.multiple = true;
  label.append(input);
  wrapper.append(label, el("span", "field__message", "Fotos hasta 10 MB y videos hasta 100 MB cada uno."));
  return { wrapper, input };
}

function validateSelectedFiles(files, existingCount) {
  if (existingCount + files.length > MAX_EVIDENCES) {
    throw new Error(`Cada actividad admite hasta ${MAX_EVIDENCES} evidencias.`);
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(`El formato de ${file.name} no está permitido.`);
    }
    const maximum = file.type.startsWith("video/") ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > maximum) {
      throw new Error(`${file.name} supera el tamaño máximo permitido.`);
    }
  }
}

async function uploadFiles(documento, activity, files, onProgress) {
  let current = activity;
  for (const file of files) {
    try {
      const resourceType = file.type.startsWith("video/") ? "video" : "image";
      const signature = await api.signEvidenceUpload(activity.id, { documento, resourceType });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signature.apiKey);
      formData.append("timestamp", String(signature.timestamp));
      formData.append("folder", signature.folder);
      formData.append("public_id", signature.publicId);
      formData.append("signature", signature.signature);
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/${resourceType}/upload`,
        { method: "POST", body: formData },
      );
      let uploaded;
      try {
        uploaded = await response.json();
      } catch {
        throw new Error("Cloudinary devolvió una respuesta no válida.");
      }
      if (!response.ok) throw new Error(uploaded.error?.message || "No se pudo subir la evidencia a Cloudinary.");
      current = await api.addActivityEvidence(activity.id, {
        documento,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
        nombre: file.name,
      });
      onProgress(current);
    } catch (error) {
      error.activity = current;
      throw error;
    }
  }
  return current;
}

function replaceActivity(activities, updated) {
  const index = activities.findIndex((activity) => activity.id === updated.id);
  if (index !== -1) activities[index] = updated;
}

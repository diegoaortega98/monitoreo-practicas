CREATE TABLE IF NOT EXISTS practicantes (
  id UUID PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  documento TEXT UNIQUE NOT NULL,
  carrera TEXT NOT NULL,
  semestres_cursados INTEGER NOT NULL CHECK (semestres_cursados >= 0),
  contacto_emergencia TEXT,
  telefono TEXT,
  meta_horas NUMERIC(7,2) CHECK (meta_horas IS NULL OR meta_horas > 0),
  horas_acumuladas NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (horas_acumuladas >= 0),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('pendiente', 'activo', 'rechazado')),
  aprobado_en TIMESTAMPTZ,
  aprobado_por TEXT,
  email TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE practicantes ALTER COLUMN meta_horas DROP NOT NULL;
ALTER TABLE practicantes
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('pendiente', 'activo', 'rechazado')),
  ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprobado_por TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS asistencias (
  id UUID PRIMARY KEY,
  practicante_id UUID NOT NULL REFERENCES practicantes(id) ON DELETE CASCADE,
  hora_entrada TIMESTAMPTZ NOT NULL,
  hora_salida TIMESTAMPTZ,
  horas NUMERIC(5,2) NOT NULL DEFAULT 0,
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'normal',
  ajustado_por TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registros_horas (
  id UUID PRIMARY KEY,
  practicante_id UUID NOT NULL REFERENCES practicantes(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ NOT NULL,
  horas NUMERIC(7,2) NOT NULL CHECK (horas > 0),
  descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS actividades (
  id UUID PRIMARY KEY,
  asistencia_id UUID NOT NULL REFERENCES asistencias(id) ON DELETE CASCADE,
  practicante_id UUID NOT NULL REFERENCES practicantes(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL CHECK (char_length(descripcion) BETWEEN 1 AND 2000),
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidencias) = 'array'),
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'en_revision', 'aprobada', 'observada')),
  comentario_revision TEXT,
  revisado_por TEXT,
  revisado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesiones_admin (
  token_hash TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asistencias_practicante
  ON asistencias(practicante_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_entrada
  ON asistencias(hora_entrada DESC);
CREATE INDEX IF NOT EXISTS idx_registros_horas_practicante
  ON registros_horas(practicante_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_actividades_asistencia
  ON actividades(asistencia_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_actividades_revision
  ON actividades(estado, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_sesiones_admin_expira
  ON sesiones_admin(expira_en);

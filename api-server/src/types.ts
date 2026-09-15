// Shared types used across routes and services

export interface ExtractedData {
  // Campos de CLIENTE
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  presupuesto: number | null;
  direccion_evento: string | null;
  requerimientos_evento: string | null;
  /** Kommo 1048778 — solo día/fecha del evento. */
  fecha_evento: string | null;
  /** Kommo 1049358 — solo horario del evento. */
  horario_evento: string | null;
  /** Vista combinada legacy / resúmenes; derivada de fecha_evento + horario_evento. */
  fecha_horario: string | null;
  num_invitados: number | null;
  tipo_evento: string | null;
  /** pedido_entrega = producto/entrega; servicio_montado = barra/meseros en evento */
  modo_servicio: "pedido_entrega" | "servicio_montado" | null;
  // Campos de PROVEEDOR / detección de tipo
  tipo_contacto: "cliente" | "proveedor" | "incierto" | null;
  empresa: string | null; // Nombre de empresa del proveedor
  /** A16075: qué ofrece / alianza. */
  proveedor_oferta?: string | null;
  /** A16075: estado(s) de cobertura o sede. */
  proveedor_estado?: string | null;
  /** A16075: link de catálogo/lista de precios, o nota (“te mando PDF”, “aún no”). */
  proveedor_catalogo?: string | null;
}

/** Empty ExtractedData — use when building fresh state. */
export function emptyExtractedData(partial: Partial<ExtractedData> = {}): ExtractedData {
  return {
    nombre: null,
    telefono: null,
    correo: null,
    presupuesto: null,
    direccion_evento: null,
    requerimientos_evento: null,
    fecha_evento: null,
    horario_evento: null,
    fecha_horario: null,
    num_invitados: null,
    tipo_evento: null,
    modo_servicio: null,
    tipo_contacto: null,
    empresa: null,
    proveedor_oferta: null,
    proveedor_estado: null,
    proveedor_catalogo: null,
    ...partial,
  };
}

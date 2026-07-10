// Shared types used across routes and services

export interface ExtractedData {
  // Campos de CLIENTE
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  presupuesto: number | null;
  direccion_evento: string | null;
  requerimientos_evento: string | null;
  fecha_horario: string | null;
  num_invitados: number | null;
  tipo_evento: string | null;
  /** pedido_entrega = producto/entrega; servicio_montado = barra/meseros en evento */
  modo_servicio: "pedido_entrega" | "servicio_montado" | null;
  // Campos de PROVEEDOR / detección de tipo
  tipo_contacto: "cliente" | "proveedor" | "incierto" | null;
  empresa: string | null;          // Nombre de empresa del proveedor
}

import { Resend } from "resend";
import { logger } from "./lib/logger.js";

export interface WelcomeEmailData {
  nombre: string;
  correo: string;
  tipo_evento: string;
  fecha_horario: string;
  num_invitados: number;
}

function buildHtml(data: WelcomeEmailData): string {
  const { nombre, tipo_evento, fecha_horario, num_invitados } = data;
  const primerNombre = nombre.split(" ")[0] ?? nombre;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>¡Bienvenido a Bodasesor!</title>
</head>
<body style="margin:0;padding:0;background:#f8f5f0;font-family:'Georgia',serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f0;padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#8b6f47 0%,#c4a265 100%);padding:48px 40px;text-align:center;">
            <p style="margin:0 0 8px 0;color:#f5e6d0;font-size:13px;letter-spacing:3px;text-transform:uppercase;">Bodasesor</p>
            <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:normal;line-height:1.3;">
              ¡Hola, ${primerNombre}! 🎉
            </h1>
            <p style="margin:16px 0 0 0;color:#f5e6d0;font-size:16px;">
              Estamos emocionados de acompañarte en este momento tan especial
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 24px 0;color:#5a4a3a;font-size:16px;line-height:1.7;">
              Recibimos toda la información de tu evento y ya está en manos de nuestro equipo. 
              A continuación, el resumen de lo que tenemos registrado:
            </p>

            <!-- Event summary card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f3;border:1px solid #e8ddd0;border-radius:8px;margin-bottom:32px;">
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 16px 0;color:#8b6f47;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Resumen de tu evento</p>

                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #ede6dc;">
                        <span style="color:#9a8070;font-size:13px;font-family:Arial,sans-serif;">Tipo de evento</span>
                      </td>
                      <td style="padding:8px 0;border-bottom:1px solid #ede6dc;text-align:right;">
                        <span style="color:#3d2b1a;font-size:15px;font-weight:bold;text-transform:capitalize;">${tipo_evento}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #ede6dc;">
                        <span style="color:#9a8070;font-size:13px;font-family:Arial,sans-serif;">Fecha y horario</span>
                      </td>
                      <td style="padding:8px 0;border-bottom:1px solid #ede6dc;text-align:right;">
                        <span style="color:#3d2b1a;font-size:15px;">${fecha_horario}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;">
                        <span style="color:#9a8070;font-size:13px;font-family:Arial,sans-serif;">Número de invitados</span>
                      </td>
                      <td style="padding:8px 0;text-align:right;">
                        <span style="color:#3d2b1a;font-size:15px;">${num_invitados} personas</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Next steps -->
            <p style="margin:0 0 16px 0;color:#8b6f47;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">Próximos pasos</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#8b6f47;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-size:13px;font-family:Arial,sans-serif;">1</div>
                </td>
                <td style="padding:10px 0 10px 12px;vertical-align:top;">
                  <p style="margin:0;color:#5a4a3a;font-size:15px;line-height:1.5;">Rodrigo revisará tu solicitud y te contactará en las próximas <strong>24 horas hábiles</strong> para agendar una llamada o visita a nuestro salón.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#8b6f47;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-size:13px;font-family:Arial,sans-serif;">2</div>
                </td>
                <td style="padding:10px 0 10px 12px;vertical-align:top;">
                  <p style="margin:0;color:#5a4a3a;font-size:15px;line-height:1.5;">Te presentaremos una <strong>propuesta personalizada</strong> con los servicios y paquetes que mejor se adapten a tu visión.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#8b6f47;border-radius:50%;text-align:center;line-height:28px;color:#fff;font-size:13px;font-family:Arial,sans-serif;">3</div>
                </td>
                <td style="padding:10px 0 10px 12px;vertical-align:top;">
                  <p style="margin:0;color:#5a4a3a;font-size:15px;line-height:1.5;">Podrás <strong>visitar nuestro salón</strong>, conocer al equipo y probar los menús de banquete.</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="https://api.whatsapp.com/send?phone=525540080373&text=Hola%2C+me+contacté+a+través+de+Lucy+y+quisiera+más+información"
                     style="display:inline-block;background:#8b6f47;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:15px;font-family:Arial,sans-serif;letter-spacing:0.5px;">
                    Hablar directamente con Rodrigo
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9a8070;font-size:14px;line-height:1.7;font-style:italic;border-left:3px solid #c4a265;padding-left:16px;">
              "Más de 10 años creando experiencias únicas e irrepetibles para los momentos más importantes de la vida."
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#3d2b1a;padding:28px 40px;text-align:center;">
            <p style="margin:0 0 8px 0;color:#c4a265;font-size:14px;font-family:Arial,sans-serif;">Bodasesor</p>
            <p style="margin:0 0 4px 0;color:#9a8070;font-size:12px;font-family:Arial,sans-serif;">hola@bodasesor.com &nbsp;|&nbsp; 55 4008 0373</p>
            <p style="margin:0;color:#9a8070;font-size:12px;font-family:Arial,sans-serif;">Lunes a Sábado, 9:00–18:00 hrs &nbsp;|&nbsp; CDMX</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    logger.warn("RESEND_API_KEY no configurada — correo de bienvenida omitido");
    return;
  }

  const resend = new Resend(apiKey);
  const { nombre, correo, tipo_evento } = data;
  const primerNombre = nombre.split(" ")[0] ?? nombre;

  try {
    const { error } = await resend.emails.send({
      from: "Lucy de Bodasesor <lucy@bodasesor.com>",
      to: [correo],
      subject: `¡Hola ${primerNombre}! Confirmamos los datos de tu ${tipo_evento} 🎉`,
      html: buildHtml(data),
    });

    if (error) {
      logger.error({ error, correo }, "Error enviando correo de bienvenida via Resend");
    } else {
      logger.info({ correo, nombre, tipo_evento }, "Correo de bienvenida enviado correctamente");
    }
  } catch (err) {
    logger.error({ err, correo }, "Excepción enviando correo de bienvenida");
  }
}

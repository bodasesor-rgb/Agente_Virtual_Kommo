require("dotenv").config();
const axios = require("axios");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

async function sendWhatsAppMessage(to, message) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("Faltan variables de entorno: WHATSAPP_TOKEN y/o PHONE_NUMBER_ID");
  }

  if (!to || !message) {
    throw new Error("Parámetros requeridos: to (número destino) y message (texto)");
  }

  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: message },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (err) {
    if (err.response) {
      const metaError = err.response.data?.error;
      throw new Error(
        `Meta API error ${err.response.status}: ${metaError?.message ?? JSON.stringify(err.response.data)}`
      );
    }
    throw new Error(`Error de red: ${err.message}`);
  }
}

module.exports = { sendWhatsAppMessage };

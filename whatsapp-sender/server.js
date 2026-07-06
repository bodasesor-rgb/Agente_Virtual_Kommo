require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

app.post("/send-whatsapp", async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "Faltan campos requeridos: 'to' y 'message'" });
  }

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    return res.status(500).json({ error: "Variables de entorno WHATSAPP_TOKEN y PHONE_NUMBER_ID no configuradas" });
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    return res.json({ success: true, meta: response.data });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({
        error: "Error de la API de Meta",
        details: err.response.data,
      });
    }
    return res.status(500).json({ error: "Error interno", details: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`WhatsApp sender corriendo en puerto ${PORT}`);
});

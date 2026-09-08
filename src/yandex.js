const YANDEX_API_URL =
  "https://ai.api.cloud.yandex.net/v1/chat/completions";

function getConfig() {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  const model = process.env.YANDEX_MODEL || "yandexgpt/latest";

  if (!apiKey) {
    throw new Error("YANDEX_API_KEY не задан");
  }

  if (!folderId) {
    throw new Error("YANDEX_FOLDER_ID не задан");
  }

  return {
    apiKey,
    folderId,
    model
  };
}

async function askYandex(messages, temperature = 0.7) {
  const config = getConfig();

  const response = await fetch(YANDEX_API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "Authorization": `Api-Key ${config.apiKey}`,
      "x-folder-id": config.folderId
    },

    body: JSON.stringify({
      model: `gpt://${config.folderId}/${config.model}`,
      messages,
      temperature
    })
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Yandex API error ${response.status}: ${text}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Yandex вернул некорректный JSON");
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Yandex не вернул текст ответа");
  }

  return content;
}

function cleanJson(text) {
  let cleaned = String(text || "").trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

async function askJson(
  systemPrompt,
  userPrompt,
  temperature = 0.7
) {
  const content = await askYandex(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature
  );

  const cleaned = cleanJson(content);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      `Yandex вернул невалидный JSON: ${cleaned}`
    );
  }
}

async function healthcheck() {
  const result = await askYandex(
    [
      {
        role: "system",
        content: "Ответь только словом OK."
      },
      {
        role: "user",
        content: "Проверка связи."
      }
    ],
    0
  );

  return result.trim();
}

module.exports = {
  askYandex,
  askJson,
  healthcheck
};

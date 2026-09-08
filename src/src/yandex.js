const YANDEX_API_URL = "https://ai.api.cloud.yandex.net/v1/chat/completions";

function getConfig() {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  const model = process.env.YANDEX_MODEL || "yandexgpt-lite/latest";

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

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Yandex не вернул текст ответа"
    );
  }

  return content;
}

function cleanJson(text) {
  let cleaned = String(text).trim();

  // Убираем markdown-обёртку ```json ... ```
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Если модель добавила текст до/после JSON,
  // пытаемся вытащить сам объект.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
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
    console.error("Не удалось распарсить JSON от Yandex:");
    console.error(content);

    throw new Error(
      "Yandex вернул ответ не в формате JSON"
    );
  }
}

async function healthcheck() {
  try {
    const result = await askYandex(
      [
        {
          role: "system",
          content:
            "Ответь одним словом: OK"
        },
        {
          role: "user",
          content:
            "Проверка соединения."
        }
      ],
      0
    );

    return result.trim();
  } catch (error) {
    console.error(
      "Yandex healthcheck error:",
      error.message
    );

    return null;
  }
}

module.exports = {
  askYandex,
  askJson,
  healthcheck
};

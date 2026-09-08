const axios = require('axios');
const config = require('./config');

const YANDEX_API_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';
const SEARCH_API_URL = 'https://searchapi.api.cloud.yandex.net/v2/web/search';

// ============================================================
// YANDEXGPT (Lite / Pro)
// ============================================================

async function gptComplete(prompt, model = 'lite', temperature = 0.3, maxTokens = 2000, system = '') {
  const apiKey = config.yandex.apiKey;
  const folderId = config.yandex.folderId;

  const modelMap = {
    lite: 'yandexgpt-lite',
    pro: 'yandexgpt-pro',
    pro32k: 'yandexgpt-32k',
  };

  const messages = [];
  if (system) {
    messages.push({ role: 'system', text: system });
  }
  messages.push({ role: 'user', text: prompt });

  const body = {
    modelUri: `gpt://${folderId}/${modelMap[model] || 'yandexgpt-lite'}`,
    completionOptions: {
      stream: false,
      temperature: temperature,
      maxTokens: maxTokens,
    },
    messages: messages,
  };

  console.log(`🧠 YandexGPT ${model} запрос...`);

  try {
    const response = await axios.post(
      YANDEX_API_URL,
      body,
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const result = response.data?.result?.alternatives?.[0]?.message?.text || '';
    console.log(`✅ Ответ получен (${result.length} символов)`);
    return result;

  } catch (error) {
    console.error('❌ Ошибка YandexGPT:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`YandexGPT error: ${error.message}`);
  }
}

// ============================================================
// YANDEX SEARCH API (ВЕБ-ПОИСК)
// ============================================================

async function searchWeb(query, limit = 5) {
  const apiKey = config.yandex.apiKey;
  const folderId = config.yandex.folderId;

  console.log(`🔍 Ищем в интернете: "${query}"`);

  try {
    const response = await axios.post(
      SEARCH_API_URL,
      {
        query: query,
        limit: limit,
      },
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const data = response.data;
    const results = data.results || [];

    console.log(`✅ Найдено ${results.length} результатов`);

    // Извлекаем сниппеты
    const snippets = results.map(r => r.snippet || r.text || r.title || '').filter(Boolean);
    const urls = results.map(r => r.url).filter(Boolean);

    return {
      query: query,
      results: results,
      snippets: snippets,
      urls: urls,
      raw: data,
    };

  } catch (error) {
    console.error('❌ Ошибка Search API:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      query: query,
      results: [],
      snippets: [],
      urls: [],
      raw: null,
    };
  }
}

async function searchAndAnswer(query) {
  const result = await searchWeb(query, 5);
  const snippets = result.snippets || [];

  if (!snippets.length) {
    return {
      answer: '🤷 Я ничего не нашёл по этому запросу. Попробуй переформулировать вопрос.',
      sources: [],
    };
  }

  const context = snippets.map((s, i) => `[${i + 1}] ${s}`).join('\n\n');

  const systemPrompt = `Ты — ассистент, который отвечает на вопросы на основе данных из интернета.

ПРАВИЛА:
1. Используй только факты из контекста.
2. Если информации недостаточно — честно скажи об этом.
3. Не придумывай ничего от себя.
4. Отвечай на русском языке.
5. В конце перечисли источники (номера в квадратных скобках).`;

  const userPrompt = `Вопрос: ${query}\n\nКонтекст:\n${context}`;

  try {
    const answer = await gptComplete(userPrompt, 'pro', 0.4, 3000, systemPrompt);
    return {
      answer: answer,
      sources: result.urls || [],
    };
  } catch (error) {
    return {
      answer: `Вот что удалось найти:\n\n${snippets.join('\n\n')}`,
      sources: result.urls || [],
    };
  }
}

// ============================================================
// HEALTHCHECK
// ============================================================

async function healthcheck() {
  try {
    const result = await gptComplete('Ответь только словом "OK" на русском.', 'lite', 0, 10);
    return result.trim() || 'OK';
  } catch (error) {
    console.error('❌ Healthcheck error:', error.message);
    return 'ERROR';
  }
}

// ============================================================
// ASK JSON (для producer.js)
// ============================================================

function cleanJSON(content) {
  let cleaned = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .replace(/^[^{]*/, '')
    .replace(/[^}]*$/, '')
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('JSON не найден в ответе');
  }
  return match[0];
}

async function askJson(systemMessage, userMessage, temperature = 0.7) {
  const response = await gptComplete(
    userMessage,
    'lite',
    temperature,
    4000,
    systemMessage + '\n\nВерни ТОЛЬКО JSON без пояснений.'
  );

  const cleaned = cleanJSON(response);
  return JSON.parse(cleaned);
}

module.exports = {
  gptComplete,
  searchWeb,
  searchAndAnswer,
  healthcheck,
  askJson,
};

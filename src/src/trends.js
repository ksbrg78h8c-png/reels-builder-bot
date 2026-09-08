const { searchWeb } = require('./yandex');
const { gptComplete } = require('./yandex');

/**
 * Анализирует тренды по теме через поиск + YandexGPT Pro
 * @param {string} topic - тема для анализа
 * @param {number} numQueries - количество поисковых запросов (по умолчанию 4)
 * @returns {Promise<string>} - отчёт с анализом трендов
 */
async function analyzeTrends(topic, numQueries = 4) {
  console.log(`📊 Анализируем тренды по теме: "${topic}"...`);

  // 1. Формируем несколько поисковых запросов для разных ракурсов
  const queries = [
    `${topic} тренды 2026`,
    `${topic} последние новости`,
    `${topic} рост популярности`,
    `${topic} прогноз развитие`,
    `${topic} что сейчас актуально`,
  ].slice(0, numQueries);

  // 2. Собираем контекст из поиска
  const collected = [];
  for (const q of queries) {
    try {
      console.log(`🔍 Поиск: "${q}"...`);
      const result = await searchWeb(q, 5);
      const snippets = result.snippets || [];
      if (snippets.length) {
        collected.push(`--- Запрос: ${q} ---\n${snippets.join('\n')}`);
      } else {
        collected.push(`--- Запрос: ${q} ---\n[ничего не найдено]`);
      }
    } catch (error) {
      console.error(`❌ Ошибка поиска "${q}":`, error.message);
      collected.push(`--- Запрос: ${q} ---\n[ошибка: ${error.message}]`);
    }
  }

  const context = collected.join('\n\n').slice(0, 15000);

  // 3. Синтез через YandexGPT Pro
  const systemPrompt = `Ты — профессиональный аналитик трендов и эксперт по контент-стратегии.

На основе предоставленных данных поиска:
1. Выдели ОСНОВНЫЕ ТРЕНДЫ — что сейчас действительно актуально
2. Определи ДИНАМИКУ — как меняется ситуация (растёт/падает/стабильно)
3. Сделай ПРОГНОЗ — что будет дальше, какие возможности открываются
4. Дай РЕКОМЕНДАЦИИ — как использовать эти тренды в контенте

СТРУКТУРУЙ ОТВЕТ:
📊 КЛЮЧЕВЫЕ ТРЕНДЫ
📈 ДИНАМИКА
🔮 ПРОГНОЗ
💡 РЕКОМЕНДАЦИИ ДЛЯ КОНТЕНТА

Отвечай на русском языке. Будь конкретным и полезным.`;

  const userPrompt = `Проанализируй тренды по теме «${topic}» на основе данных поиска:\n\n${context}`;

  console.log('🧠 Генерируем аналитический отчёт через YandexGPT Pro...');

  try {
    const result = await gptComplete(userPrompt, 'pro', 0.4, 4000, systemPrompt);
    return result;
  } catch (error) {
    console.error('❌ Ошибка генерации отчёта:', error.message);
    // Если GPT не сработал, возвращаем сырые данные
    return `📊 АНАЛИЗ ТРЕНДОВ: ${topic}\n\n` +
           `Не удалось сгенерировать полный отчёт.\n\n` +
           `Сырые данные из поиска:\n${context}`;
  }
}

/**
 * Быстрый анализ трендов (краткая версия)
 * @param {string} topic - тема
 * @returns {Promise<string>} - краткий отчёт
 */
async function quickTrends(topic) {
  console.log(`⚡ Быстрый анализ трендов: "${topic}"...`);

  const queries = [
    `${topic} тренды`,
    `${topic} актуально сейчас`,
  ];

  const collected = [];
  for (const q of queries) {
    try {
      const result = await searchWeb(q, 3);
      const snippets = result.snippets || [];
      if (snippets.length) {
        collected.push(snippets.join('\n'));
      }
    } catch (_) {}
  }

  const context = collected.join('\n\n').slice(0, 5000);

  const prompt = `На основе данных поиска выдели 3 главных тренда по теме "${topic}".\n\nДанные:\n${context}`;

  try {
    const result = await gptComplete(prompt, 'pro', 0.3, 1500);
    return result;
  } catch (error) {
    return `Не удалось проанализировать тренды по теме "${topic}". Попробуй позже.`;
  }
}

module.exports = {
  analyzeTrends,
  quickTrends,
};
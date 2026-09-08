require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const express = require('express');
const dns = require('dns');
const os = require('os');

// ====================================================================
// 1. СИСТЕМНАЯ ИНФОРМАЦИЯ
// ====================================================================
console.log('\n========================================');
console.log('🚀 ЗАПУСК REELS BUILDER BOT');
console.log('========================================');
console.log(`⏰ Время запуска: ${new Date().toLocaleString()}`);
console.log(`🖥️  Хост: ${os.hostname()}`);
console.log(`📦 Платформа: ${os.platform()} ${os.arch()}`);
console.log(`🧠 Память: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
console.log(`🐍 Node.js: ${process.version}`);
console.log(`📁 Текущая директория: ${process.cwd()}`);
console.log('========================================\n');

// ====================================================================
// 2. ПРОВЕРКА DNS
// ====================================================================
console.log('🔍 [1/6] ПРОВЕРКА DNS...');
dns.resolve('ai.api.cloud.yandex.net', (err, addresses) => {
  if (err) {
    console.error('❌ DNS ОШИБКА:', err.message);
    console.error('   → Яндекс не будет доступен!');
  } else {
    console.log('✅ DNS РАБОТАЕТ:', addresses);
    console.log(`   → Найдено ${addresses.length} IP-адресов`);
  }
});

// ====================================================================
// 3. ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
// ====================================================================
console.log('\n🔍 [2/6] ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ...');

const envVars = {
  'YANDEX_API_KEY': process.env.YANDEX_API_KEY,
  'YANDEX_FOLDER_ID': process.env.YANDEX_FOLDER_ID,
  'TELEGRAM_TOKEN': process.env.TELEGRAM_TOKEN,
};

let allEnvVarsOk = true;
for (const [key, value] of Object.entries(envVars)) {
  if (value) {
    const displayValue = key === 'TELEGRAM_TOKEN' 
      ? value.substring(0, 10) + '...' + value.substring(value.length - 5)
      : key === 'YANDEX_API_KEY'
      ? value.substring(0, 10) + '...' + value.substring(value.length - 5)
      : value;
    console.log(`   ✅ ${key}: ${displayValue}`);
  } else {
    console.error(`   ❌ ${key}: НЕ УСТАНОВЛЕНА!`);
    allEnvVarsOk = false;
  }
}

if (!allEnvVarsOk) {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА: Не все переменные окружения заданы!');
  console.error('   → Бот не сможет работать. Проверьте настройки Render.');
  process.exit(1);
}
console.log('   ✅ Все переменные окружения заданы корректно');

// ====================================================================
// 4. ПРОВЕРКА ДОСТУПНОСТИ YANDEXGPT (тестовый запрос)
// ====================================================================
console.log('\n🔍 [3/6] ПРОВЕРКА ДОСТУПНОСТИ YANDEXGPT...');

const testClient = new OpenAI({
  apiKey: process.env.YANDEX_API_KEY,
  baseURL: 'https://ai.api.cloud.yandex.net/v1',
  defaultHeaders: {
    'x-folder-id': process.env.YANDEX_FOLDER_ID,
  }
});

async function testYandexConnection() {
  try {
    console.log('   → Отправляем тестовый запрос к YandexGPT...');
    const response = await testClient.chat.completions.create({
      model: `gpt://${process.env.YANDEX_FOLDER_ID}/yandexgpt-lite/latest`,
      messages: [
        { role: 'system', content: 'Ты — полезный ассистент. Ответь одним словом "ОК" на русском.' },
        { role: 'user', content: 'Ответь ОК' }
      ],
      temperature: 0.1,
      max_tokens: 10
    });
    console.log('   ✅ YandexGPT ДОСТУПЕН!');
    console.log(`   → Ответ: "${response.choices[0].message.content}"`);
    return true;
  } catch (error) {
    console.error('   ❌ YandexGPT НЕДОСТУПЕН!');
    console.error(`   → Ошибка: ${error.message}`);
    if (error.response) {
      console.error(`   → Статус: ${error.response.status}`);
      console.error(`   → Данные: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

let yandexAvailable = false;

// ====================================================================
// 5. СОЗДАНИЕ КЛИЕНТА И БОТА
// ====================================================================
console.log('\n🔍 [4/6] СОЗДАНИЕ КЛИЕНТОВ...');

try {
  console.log('   → Создаём клиент YandexGPT...');
  const client = new OpenAI({
    apiKey: process.env.YANDEX_API_KEY,
    baseURL: 'https://ai.api.cloud.yandex.net/v1',
    defaultHeaders: {
      'x-folder-id': process.env.YANDEX_FOLDER_ID,
    }
  });
  console.log('   ✅ Клиент YandexGPT создан');

  console.log('   → Создаём Telegram бота...');
  const token = process.env.TELEGRAM_TOKEN;
  const bot = new TelegramBot(token, { polling: true });
  console.log('   ✅ Telegram бот создан');

  // ====================================================================
  // 6. ВЕБ-СЕРВЕР ДЛЯ RENDER
  // ====================================================================
  console.log('\n🔍 [5/6] ЗАПУСК ВЕБ-СЕРВЕРА...');
  const app = express();
  const port = process.env.PORT || 3000;
  
  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      bot: 'Reels Builder Bot',
      version: '1.0.0',
      yandex_available: yandexAvailable,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
  
  app.listen(port, () => {
    console.log(`   ✅ Веб-сервер запущен на порту ${port}`);
    console.log(`   → URL: https://reels-builder-bot.onrender.com`);
  });

  // ====================================================================
  // 7. ТЕСТОВЫЙ ЗАПРОС К YANDEXGPT
  // ====================================================================
  console.log('\n🔍 [6/6] ВЫПОЛНЕНИЕ ТЕСТОВОГО ЗАПРОСА...');
  
  setTimeout(async () => {
    yandexAvailable = await testYandexConnection();
    
    if (yandexAvailable) {
      console.log('\n✅ ВСЕ СИСТЕМЫ РАБОТАЮТ!');
      console.log('   → Бот готов к работе');
      console.log('   → Telegram: https://t.me/ReelsBuilderProBot');
    } else {
      console.log('\n⚠️ БОТ ЗАПУЩЕН, НО YANDEXGPT НЕДОСТУПЕН!');
      console.log('   → Проверьте API-ключ и Folder ID');
    }
    console.log('========================================\n');
  }, 3000);

  // ====================================================================
  // 8. КОМАНДЫ БОТА
  // ====================================================================
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📩 Команда /start от пользователя ${msg.from.username || msg.from.id}`);
    await bot.sendMessage(chatId,
      `🎬 *Reels Builder*\n\nИз идеи — в готовый Reels.\n\nПросто напиши, что хочешь снять.\n\n*Примеры:*\n📱 "Как перестать откладывать"\n💼 "Кейс из моей практики"\n🔥 "Ошибка, которую я совершал"`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📩 Команда /help от пользователя ${msg.from.username || msg.from.id}`);
    await bot.sendMessage(chatId,
      `📖 *Как пользоваться:*\n\n1. Напиши идею для Reels\n2. Выбери хук из трёх вариантов\n3. Получи готовый план: Shot List, сценарий, CTA, обложки\n\n*Команды:*\n/start — приветствие\n/help — помощь`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`📩 Команда /status от пользователя ${msg.from.username || msg.from.id}`);
    await bot.sendMessage(chatId,
      `📊 *Статус бота*\n\n` +
      `✅ Бот работает\n` +
      `🔗 YandexGPT: ${yandexAvailable ? '✅ Доступен' : '❌ Недоступен'}\n` +
      `⏰ Время: ${new Date().toLocaleString()}\n` +
      `📦 Версия: 1.0.0`,
      { parse_mode: 'Markdown' }
    );
  });

  // ====================================================================
  // 9. ОСНОВНАЯ ЛОГИКА
  // ====================================================================
  const userStates = new Map();

  async function generateConceptAndHooks(idea) {
    console.log('📤 Отправляем запрос к YandexGPT...');
    console.log(`   → Идея: "${idea}"`);
    
    const prompt = `
      Ты — эксперт по Instagram Reels.
      Определи для идеи пользователя:
      1. Концепцию (одна фраза, суть)
      2. Формат (Talking Head / Faceless / Storytelling)
      3. Длительность (10-15 сек / 20-30 сек / 30-45 сек)
      4. Стиль (Разговорный / Экспертный / Дерзкий)
      
      Сгенерируй 3 разных хука:
      1. Контрарный (ломает стереотип)
      2. Curiosity (создаёт вопрос)
      3. Прямой (личное обращение)
      
      Верни ТОЛЬКО JSON без пояснений:
      {
        "concept": "...",
        "format": "...",
        "duration": "...",
        "style": "...",
        "hooks": [
          { "type": "Контрарный", "text": "...", "why": "..." },
          { "type": "Curiosity", "text": "...", "why": "..." },
          { "type": "Прямой", "text": "...", "why": "..." }
        ]
      }
      
      Идея: ${idea}
    `;

    try {
      const response = await client.chat.completions.create({
        model: `gpt://${process.env.YANDEX_FOLDER_ID}/yandexgpt-lite/latest`,
        messages: [
          { role: 'system', content: 'Ты — эксперт по Instagram Reels. Отвечай только на русском языке. Используй живую, разговорную речь.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      });
      console.log('   ✅ Ответ от YandexGPT получен');
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('   ❌ ОШИБКА YandexGPT:');
      console.error(`   → ${error.message}`);
      if (error.response) {
        console.error(`   → Статус: ${error.response.status}`);
        console.error(`   → Данные: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  async function generateReelsPackage(data) {
    console.log('📤 Генерируем пакет для Reels...');
    console.log(`   → Концепция: "${data.concept}"`);
    console.log(`   → Хук: "${data.hook}"`);
    
    const prompt = `
      Создай READY-TO-SHOOT PACKAGE для Instagram Reels:
      
      Идея: ${data.idea}
      Концепция: ${data.concept}
      Формат: ${data.format}
      Длительность: ${data.duration}
      Стиль: ${data.style}
      Хук: ${data.hook}
      
      Верни ТОЛЬКО JSON:
      {
        "title": "...",
        "scenes": [
          { "visual": "...", "audio": "...", "text_on_screen": "..." }
        ],
        "script": "...",
        "cta": "...",
        "caption": "...",
        "cover": ["...", "...", "..."],
        "verdict": "...",
        "weakness": "..."
      }
      
      Требования:
      - Речь как живой человек, не как статья
      - Кадры выполнимы со смартфоном
      - Никаких AI-клише
      - Не обещай вирусность
    `;

    try {
      const response = await client.chat.completions.create({
        model: `gpt://${process.env.YANDEX_FOLDER_ID}/yandexgpt-lite/latest`,
        messages: [
          { role: 'system', content: 'Ты — эксперт по Instagram Reels. Отвечай только на русском языке. Используй живую, разговорную речь.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      });
      console.log('   ✅ Пакет сгенерирован');
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('   ❌ ОШИБКА YandexGPT:');
      console.error(`   → ${error.message}`);
      if (error.response) {
        console.error(`   → Статус: ${error.response.status}`);
        console.error(`   → Данные: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    console.log(`📩 Сообщение от ${msg.from.username || msg.from.id}: "${text}"`);
    userStates.set(chatId, { idea: text });

    try {
      await bot.sendMessage(chatId, '🤔 Анализирую идею...');
      console.log('   → Начинаем генерацию концепции...');
      const conceptData = await generateConceptAndHooks(text);

      console.log('   → Отправляем концепцию пользователю...');
      await bot.sendMessage(chatId,
        `🎯 *КОНЦЕПЦИЯ*\n\n"${conceptData.concept}"\n\n${conceptData.format} · ${conceptData.duration} · ${conceptData.style}`,
        { parse_mode: 'Markdown' }
      );

      const hookButtons = conceptData.hooks.map((_, i) => [
        { text: ['🔥', '🔍', '⚡'][i] + ` Хук ${i+1}`, callback_data: `hook_${i}` }
      ]);

      await bot.sendMessage(chatId,
        `*Выбери хук:*\n\n` +
        conceptData.hooks.map((h, i) =>
          `${['🔥', '🔍', '⚡'][i]} *${h.type}*\n"${h.text}"\n_${h.why}_\n`
        ).join('\n'),
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: hookButtons }
        }
      );

      userStates.set(chatId, { idea: text, conceptData });
      console.log('   ✅ Концепция и хуки отправлены');

    } catch (error) {
      console.error('   ❌ ОШИБКА в обработке сообщения:', error.message);
      await bot.sendMessage(chatId, '❌ Ошибка. Попробуй ещё раз.');
    }
  });

  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const username = callbackQuery.from.username || callbackQuery.from.id;

    console.log(`📩 Callback от ${username}: "${data}"`);

    if (data.startsWith('hook_')) {
      const idx = parseInt(data.split('_')[1]);
      const state = userStates.get(chatId);
      if (!state) {
        await bot.sendMessage(chatId, '❌ Начни сначала: напиши идею.');
        return;
      }

      const hook = state.conceptData.hooks[idx];
      console.log(`   → Выбран хук ${idx+1}: "${hook.text}"`);
      await bot.answerCallbackQuery(callbackQuery.id);

      try {
        await bot.sendMessage(chatId, '📝 Собираю Reels...');
        console.log('   → Начинаем генерацию пакета...');

        const pkg = await generateReelsPackage({
          idea: state.idea,
          concept: state.conceptData.concept,
          format: state.conceptData.format,
          duration: state.conceptData.duration,
          style: state.conceptData.style,
          hook: hook.text
        });

        console.log('   → Отправляем готовый пакет...');
        let response = `🎬 *READY TO SHOOT*\n\n*"${pkg.title || state.conceptData.concept}"*\n\n`;
        response += `*📋 SHOT LIST*\n\n`;
        pkg.scenes.forEach((scene, i) => {
          response += `*${String(i+1).padStart(2, '0')}*\n`;
          response += `📹 КАДР: ${scene.visual}\n`;
          response += `🎤 РЕЧЬ: "${scene.audio}"\n`;
          if (scene.text_on_screen) response += `📝 ТЕКСТ: *${scene.text_on_screen}*\n`;
          response += `\n`;
        });

        response += `*📄 FULL SCRIPT*\n\n"${pkg.script}"\n\n`;
        response += `*🎯 CTA*\n${pkg.cta}\n\n`;
        response += `*📝 CAPTION*\n${pkg.caption}\n\n`;
        response += `*🎨 COVER (3 варианта)*\n${pkg.cover.map((c,i) => `${i+1}. "${c}"`).join('\n')}\n\n`;
        response += `*💡 VERDICT*\n${pkg.verdict}`;

        const buttons = {
          inline_keyboard: [
            [
              { text: '📋 Копировать', callback_data: 'copy' },
              { text: '💾 Сохранить', callback_data: 'save' }
            ],
            [
              { text: '🔨 Сделать сильнее', callback_data: 'strengthen' },
              { text: '🔄 Новый Reels', callback_data: 'new' }
            ]
          ]
        };

        await bot.sendMessage(chatId, response, {
          parse_mode: 'Markdown',
          reply_markup: buttons
        });

        userStates.set(chatId, { ...state, packageData: pkg });
        console.log('   ✅ Готовый пакет отправлен');

      } catch (error) {
        console.error('   ❌ ОШИБКА при создании Reels:', error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при создании Reels. Попробуй ещё раз.');
      }
    }

    if (data === 'copy') {
      const state = userStates.get(chatId);
      if (state?.packageData) {
        console.log(`   → Пользователь скопировал Reels: "${state.packageData.title}"`);
        const fullText = [
          `ГОТОВЫЙ REELS: ${state.packageData.title || state.conceptData.concept}`,
          '',
          'SHOT LIST:',
          ...state.packageData.scenes.map((s, i) =>
            `${i + 1}. КАДР: ${s.visual} | РЕЧЬ: "${s.audio}"${s.text_on_screen ? ` | ТЕКСТ: ${s.text_on_screen}` : ''}`
          ),
          '',
          'FULL SCRIPT:',
          state.packageData.script,
          '',
          'CTA:',
          state.packageData.cta,
          '',
          'CAPTION:',
          state.packageData.caption,
          '',
          'COVER:',
          ...state.packageData.cover.map((c, i) => `${i + 1}. ${c}`),
          '',
          'VERDICT:',
          state.packageData.verdict
        ].join('\n');

        await bot.sendMessage(chatId, fullText);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '✅ Скопировано! Вставь в заметки.'
        });
      }
    }

    if (data === 'save') {
      console.log(`   → Пользователь сохранил Reels`);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '💾 Сохранено! (пока в разработке)'
      });
    }

    if (data === 'strengthen') {
      const state = userStates.get(chatId);
      console.log(`   → Пользователь запросил "Сделать сильнее"`);
      if (state?.packageData?.weakness) {
        await bot.sendMessage(chatId,
          `🔨 *Сделать сильнее*\n\n` +
          `Я вижу одну главную проблему:\n\n` +
          `${state.packageData.weakness}\n\n` +
          `Попробуй начать с другого хука или изменить первую сцену.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(chatId,
          `🔨 *Сделать сильнее*\n\n` +
          `Пока всё выглядит хорошо. Попробуй немного сократить первую сцену — это улучшит удержание.`,
          { parse_mode: 'Markdown' }
        );
      }
      await bot.answerCallbackQuery(callbackQuery.id);
    }

    if (data === 'new') {
      console.log(`   → Пользователь начал новый Reels`);
      await bot.sendMessage(chatId, '🔄 Отлично! Напиши новую идею.');
      userStates.delete(chatId);
      await bot.answerCallbackQuery(callbackQuery.id);
    }
  });

  console.log('\n🤖 Reels Builder Bot запущен!');
  console.log(`📱 Telegram: https://t.me/ReelsBuilderProBot`);
  console.log('========================================\n');

} catch (error) {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА ПРИ ЗАПУСКЕ:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}

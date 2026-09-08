require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const YANDEX_API_KEY = process.env.YANDEX_API_KEY;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;

// --- YANDEXGPT ЗАПРОС ---

async function callYandexGPT(prompt) {
  const url = 'https://llm.api.cloud.yandex.net/yandexgpt/v1/completion';
  
  const response = await axios.post(url, {
    model: 'yandexgpt',
    messages: [
      {
        role: 'system',
        text: 'Ты — эксперт по Instagram Reels. Отвечай только на русском языке. Используй живую, разговорную речь.'
      },
      {
        role: 'user',
        text: prompt
      }
    ],
    temperature: 0.8,
    maxTokens: 2000
  }, {
    headers: {
      'Authorization': `Api-Key ${YANDEX_API_KEY}`,
      'x-folder-id': YANDEX_FOLDER_ID,
      'Content-Type': 'application/json'
    }
  });

  return response.data.result.alternatives[0].message.text;
}

// --- ГЕНЕРАЦИЯ КОНЦЕПЦИИ И ХУКОВ ---

async function generateConceptAndHooks(idea) {
  const prompt = `
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

  const result = await callYandexGPT(prompt);
  return JSON.parse(result);
}

// --- ГЕНЕРАЦИЯ ГОТОВОГО ПАКЕТА ---

async function generateReelsPackage(data) {
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

  const result = await callYandexGPT(prompt);
  return JSON.parse(result);
}

// --- КОМАНДЫ БОТА ---

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    `🎬 *Reels Builder*\n\n` +
    `Из идеи — в готовый Reels.\n\n` +
    `Просто напиши, что хочешь снять.\n\n` +
    `*Примеры:*\n` +
    `📱 "Как перестать откладывать"\n` +
    `💼 "Кейс из моей практики"\n` +
    `🔥 "Ошибка, которую я совершал"`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    `📖 *Как пользоваться:*\n\n` +
    `1. Напиши идею для Reels\n` +
    `2. Выбери хук из трёх вариантов\n` +
    `3. Получи готовый план: Shot List, сценарий, CTA, обложки\n\n` +
    `*Команды:*\n` +
    `/start — приветствие\n` +
    `/help — помощь`,
    { parse_mode: 'Markdown' }
  );
});

const userStates = new Map();

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  userStates.set(chatId, { idea: text });

  try {
    await bot.sendMessage(chatId, '🤔 Анализирую идею...');
    const conceptData = await generateConceptAndHooks(text);

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

  } catch (error) {
    console.error('Error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка. Попробуй ещё раз.');
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('hook_')) {
    const idx = parseInt(data.split('_')[1]);
    const state = userStates.get(chatId);
    if (!state) {
      await bot.sendMessage(chatId, '❌ Начни сначала: напиши идею.');
      return;
    }

    const hook = state.conceptData.hooks[idx];
    await bot.answerCallbackQuery(callbackQuery.id);

    try {
      await bot.sendMessage(chatId, '📝 Собираю Reels...');

      const pkg = await generateReelsPackage({
        idea: state.idea,
        concept: state.conceptData.concept,
        format: state.conceptData.format,
        duration: state.conceptData.duration,
        style: state.conceptData.style,
        hook: hook.text
      });

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

    } catch (error) {
      console.error('Error:', error);
      await bot.sendMessage(chatId, '❌ Ошибка при создании Reels. Попробуй ещё раз.');
    }
  }

  if (data === 'copy') {
    const state = userStates.get(chatId);
    if (state?.packageData) {
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
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '💾 Сохранено! (пока в разработке)'
    });
  }

  if (data === 'strengthen') {
    const state = userStates.get(chatId);
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
    await bot.sendMessage(chatId, '🔄 Отлично! Напиши новую идею.');
    userStates.delete(chatId);
    await bot.answerCallbackQuery(callbackQuery.id);
  }
});

console.log('🤖 Reels Builder Bot запущен!');

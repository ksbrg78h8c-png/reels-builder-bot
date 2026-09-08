require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-4o-mini';

// --- ГЕНЕРАЦИЯ КОНЦЕПЦИИ И ХУКОВ ---

async function generateConceptAndHooks(idea) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `
          Ты — эксперт по Instagram Reels.

          Определи для идеи пользователя:
          1. Концепцию (одна фраза, суть)
          2. Формат (Talking Head / Faceless / Storytelling / B-roll)
          3. Длительность (10-15 сек / 20-30 сек / 30-45 сек / 45-60 сек)
          4. Стиль (Разговорный / Экспертный / Дерзкий / Спокойный / Ироничный)

          Сгенерируй 3 разных хука:
          1. Контрарный (ломает стереотип)
          2. Curiosity (создаёт открытый вопрос)
          3. Прямой (личное обращение)

          Для каждого хука укажи:
          - текст
          - тип
          - почему работает (одна строка)

          Верни JSON:
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

          Никаких AI-клише. Речь как живой человек.
        `
      },
      { role: 'user', content: idea }
    ],
    temperature: 0.8,
    max_tokens: 1500
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

// --- ГЕНЕРАЦИЯ ГОТОВОГО ПАКЕТА ---

async function generateReelsPackage(data) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `
          Ты — эксперт по Instagram Reels.

          Создай READY-TO-SHOOT PACKAGE на основе данных:

          Идея: ${data.idea}
          Концепция: ${data.concept}
          Формат: ${data.format}
          Длительность: ${data.duration}
          Стиль: ${data.style}
          Выбранный хук: ${data.hook}

          Создай:

          1. SHOT LIST (5-7 сцен):
             Каждая сцена: КАДР (конкретный, снимаемый), РЕЧЬ (короткая фраза), ТЕКСТ НА ЭКРАНЕ (1-2 слова)

          2. FULL SCRIPT (сплошной текст, живая речь, без AI-клише)

          3. CTA (зависит от цели)

          4. CAPTION (продолжает Reels, добавляет контекст)

          5. COVER (3 варианта, каждый максимально короткий)

          6. VERDICT (честный абзац: что работает, что можно улучшить)

          7. WEAKNESS (одно слабое место, если есть)

          Верни JSON:
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

          Критически:
          - Речь как живой человек, не как статья
          - Кадры выполнимы со смартфоном
          - Никаких AI-клише
          - Не обещай вирусность
        `
      },
      { role: 'user', content: data.idea }
    ],
    temperature: 0.7,
    max_tokens: 4000
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

// --- КОМАНДЫ БОТА ---

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    `🎬 *Reels Builder*\n\n` +
    `Из идеи — в готовый Reels.\n\n` +
    `Просто напиши, что хочешь снять, и я превращу это в пошаговый план для съёмки.\n\n` +
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

// --- ХРАНИЛИЩЕ СОСТОЯНИЙ ---

const userStates = new Map();

// --- ОБРАБОТКА ТЕКСТА ---

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  userStates.set(chatId, { idea: text, step: 'concept' });

  try {
    await bot.sendMessage(chatId, '🤔 Анализирую идею...');

    const conceptData = await generateConceptAndHooks(text);

    await bot.sendMessage(chatId,
      `🎯 *КОНЦЕПЦИЯ*\n\n` +
      `"${conceptData.concept}"\n\n` +
      `*${conceptData.format}* · *${conceptData.duration}* · *${conceptData.style}*`,
      { parse_mode: 'Markdown' }
    );

    const hookButtons = conceptData.hooks.map((_, index) => [
      {
        text: `${['🔥', '🔍', '⚡'][index]} Хук ${index + 1}`,
        callback_data: `hook_${index}`
      }
    ]);

    await bot.sendMessage(chatId,
      `*Выбери хук:*\n\n` +
      conceptData.hooks.map((h, i) =>
        `${['🔥', '🔍', '⚡'][i]} *${h.type}*\n` +
        `"${h.text}"\n` +
        `_${h.why}_\n`
      ).join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: hookButtons
        }
      }
    );

    userStates.set(chatId, {
      ...userStates.get(chatId),
      conceptData,
      step: 'select_hook'
    });

  } catch (error) {
    console.error('Error:', error);
    await bot.sendMessage(chatId,
      '❌ Что-то пошло не так. Попробуй ещё раз.'
    );
  }
});

// --- ОБРАБОТКА КНОПОК ---

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('hook_')) {
    const hookIndex = parseInt(data.split('_')[1]);
    const state = userStates.get(chatId);

    if (!state || !state.conceptData) {
      await bot.sendMessage(chatId, '❌ Начни сначала: напиши идею.');
      return;
    }

    const selectedHook = state.conceptData.hooks[hookIndex];
    await bot.answerCallbackQuery(callbackQuery.id);

    await bot.sendMessage(chatId,
      `✅ Выбран хук: *"${selectedHook.text}"*`,
      { parse_mode: 'Markdown' }
    );

    await bot.sendMessage(chatId, '📝 Собираю готовый Reels...');

    try {
      const packageData = await generateReelsPackage({
        idea: state.idea,
        concept: state.conceptData.concept,
        format: state.conceptData.format,
        duration: state.conceptData.duration,
        style: state.conceptData.style,
        hook: selectedHook.text
      });

      let response = `🎬 *READY TO SHOOT*\n\n`;
      response += `*"${packageData.title || state.conceptData.concept}"*\n\n`;

      response += `*📋 SHOT LIST*\n\n`;
      packageData.scenes.forEach((scene, i) => {
        response += `*${String(i + 1).padStart(2, '0')}*\n`;
        response += `📹 КАДР: ${scene.visual}\n`;
        response += `🎤 РЕЧЬ: "${scene.audio}"\n`;
        if (scene.text_on_screen) {
          response += `📝 ТЕКСТ: *${scene.text_on_screen}*\n`;
        }
        response += `\n`;
      });

      response += `*📄 FULL SCRIPT*\n\n`;
      response += `"${packageData.script}"\n\n`;

      response += `*🎯 CTA*\n`;
      response += `${packageData.cta}\n\n`;

      response += `*📝 CAPTION*\n`;
      response += `${packageData.caption}\n\n`;

      response += `*🎨 COVER (3 варианта)*\n`;
      packageData.cover.forEach((c, i) => {
        response += `${i + 1}. "${c}"\n`;
      });
      response += `\n`;

      response += `*💡 VERDICT*\n`;
      response += `${packageData.verdict}`;

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

      userStates.set(chatId, {
        ...state,
        packageData,
        step: 'result'
      });

    } catch (error) {
      console.error('Error generating package:', error);
      await bot.sendMessage(chatId,
        '❌ Ошибка при создании Reels. Попробуй ещё раз.'
      );
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

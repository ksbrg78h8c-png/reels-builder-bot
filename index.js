require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1',
});

const MODEL = 'deepseek-chat';

async function generateConceptAndHooks(idea) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `
          Ты — эксперт по Instagram Reels.
          Определи для идеи пользователя:
          1. Концепцию (одна фраза, суть)
          2. Формат (Talking Head / Faceless / Storytelling)
          3. Длительность (10-15 сек / 20-30 сек / 30-45 сек)
          4. Стиль (Разговорный / Экспертный / Дерзкий)
          
          Сгенерируй 3 разных хука:
          1. Контрарный
          2. Curiosity
          3. Прямой
          
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

async function generateReelsPackage(data) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `
          Ты — эксперт по Instagram Reels.
          Создай READY-TO-SHOOT PACKAGE:
          
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
          
          Речь как живой человек. Кадры выполнимы со смартфоном. Никаких AI-клише.
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
    `Просто напиши, что хочешь снять.\n\n` +
    `*Примеры:*\n` +
    `📱 "Как перестать откладывать"\n` +
    `💼 "Кейс из моей практики"`,
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
    console.error(error);
    await bot.sendMessage(chatId, '❌ Ошибка. Попробуй ещё раз.');
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('hook_')) {
    const idx = parseInt(data.split('_')[1]);
    const state = userStates.get(chatId);
    if (!state) return;

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

      let response = `🎬 *READY TO SHOOT*\n\n*"${pkg.title}"*\n\n`;
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
      response += `*🎨 COVER*\n${pkg.cover.map((c,i) => `${i+1}. "${c}"`).join('\n')}\n\n`;
      response += `*💡 VERDICT*\n${pkg.verdict}`;

      await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error(error);
      await bot.sendMessage(chatId, '❌ Ошибка при создании Reels.');
    }
  }
});

console.log('🤖 Reels Builder Bot запущен!');

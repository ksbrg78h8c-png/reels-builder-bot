const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('./config');

// Импортируем все модули
const { recognizeImage } = require('./vision');
const { recognizeAudio, recognizeAudioAsync } = require('./speech');
const { processVideo } = require('./media');
const { uploadAudio, generateKey } = require('./storage');
const { analyzeTrends, quickTrends } = require('./trends');
const {
  gptComplete,
  searchAndAnswer,
  healthcheck,
} = require('./yandex');

// Импортируем продюсера
const {
  diagnoseIdea,
  generateConcepts,
  generateHooks,
  buildReel,
  strengthenReel,
  generateNoIdea,
} = require('./producer');

require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN не найден');
  process.exit(1);
}

// ============================================================
// TELEGRAM БОТ (POLLING)
// ============================================================
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log('✅ Telegram бот запущен (polling)');

bot.on('polling_error', (error) => {
  console.error('❌ Telegram polling error:', error.message);
});

// ============================================================
// СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЕЙ
// ============================================================
const users = new Map();

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      mode: null,
      idea: '',
      goal: 'Охват',
      diagnosis: null,
      concepts: null,
      concept: null,
      hooks: null,
      hook: null,
      reel: null,
      savedReels: [],
      profile: { niche: '', audience: '', style: '', tone: '' },
    });
  }
  return users.get(userId);
}

function resetCurrentReel(user) {
  user.mode = null;
  user.idea = '';
  user.diagnosis = null;
  user.concepts = null;
  user.concept = null;
  user.hooks = null;
  user.hook = null;
  user.reel = null;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
async function sendMessage(chatId, text, extra = {}) {
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
  } catch (error) {
    console.error('❌ sendMessage error:', error.message);
  }
}

async function sendLongMessage(chatId, text, extra = {}) {
  const MAX_LENGTH = 3900;
  if (text.length <= MAX_LENGTH) {
    await sendMessage(chatId, text, extra);
    return;
  }
  let remaining = text;
  while (remaining.length > MAX_LENGTH) {
    let cut = remaining.lastIndexOf('\n', MAX_LENGTH);
    if (cut < 1000) cut = MAX_LENGTH;
    const part = remaining.slice(0, cut);
    await sendMessage(chatId, part, extra);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) {
    await sendMessage(chatId, remaining, extra);
  }
}

// ============================================================
// КЛАВИАТУРЫ
// ============================================================
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: '🎬 СОЗДАТЬ REEL' }, { text: '💡 ИДЕИ' }],
      [{ text: '🔥 ТРЕНДЫ' }, { text: '📚 МОИ REELS' }],
      [{ text: '👤 ПРОФИЛЬ' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function goalsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🚀 Охват', callback_data: 'goal_reach' }, { text: '👥 Подписчики', callback_data: 'goal_follow' }],
      [{ text: '💾 Сохранения', callback_data: 'goal_save' }, { text: '💬 Комментарии', callback_data: 'goal_comments' }],
      [{ text: '🤝 Доверие', callback_data: 'goal_trust' }, { text: '💰 Продажа', callback_data: 'goal_sale' }],
    ],
  };
}

function afterDiagnosisKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💡 ПОКАЗАТЬ КОНЦЕПЦИИ', callback_data: 'concepts' }],
      [{ text: '🎬 НОВАЯ ИДЕЯ', callback_data: 'new_reel' }],
      [{ text: '🏠 ГЛАВНОЕ МЕНЮ', callback_data: 'home' }],
    ],
  };
}

function conceptsKeyboard(concepts) {
  const keyboard = concepts.slice(0, 3).map((c, i) => [
    { text: `${i + 1}. ${c.title || 'Концепция'}`, callback_data: `concept_${i}` },
  ]);
  keyboard.push([{ text: '🏠 ГЛАВНОЕ МЕНЮ', callback_data: 'home' }]);
  return { inline_keyboard: keyboard };
}

function hooksKeyboard(hooks) {
  const keyboard = hooks.slice(0, 3).map((h, i) => [
    { text: `🎯 ${i + 1}. ${h.text || 'Хук'}`, callback_data: `hook_${i}` },
  ]);
  keyboard.push([{ text: '🏠 ГЛАВНОЕ МЕНЮ', callback_data: 'home' }]);
  return { inline_keyboard: keyboard };
}

function reelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔥 СДЕЛАТЬ СИЛЬНЕЕ', callback_data: 'strengthen' }],
      [{ text: '💾 СОХРАНИТЬ REEL', callback_data: 'save_reel' }],
      [{ text: '🎬 НОВЫЙ REEL', callback_data: 'new_reel' }],
      [{ text: '🏠 ГЛАВНОЕ МЕНЮ', callback_data: 'home' }],
    ],
  };
}

function savedKeyboard(reels) {
  const keyboard = reels.map((_, i) => [
    { text: `🎬 REEL ${i + 1}`, callback_data: `open_saved_${i}` },
  ]);
  keyboard.push([{ text: '🏠 ГЛАВНОЕ МЕНЮ', callback_data: 'home' }]);
  return { inline_keyboard: keyboard };
}

// ============================================================
// ФОРМАТТЕРЫ
// ============================================================
function formatDiagnosis(d) {
  return `
<b>🔎 ДИАГНОСТИКА ИДЕИ</b>

<b>Что ты хочешь сказать:</b>
${d.what_author_wants_to_say || '—'}

<b>Для кого:</b>
${d.audience || '—'}

<b>Цель:</b>
${d.goal || '—'}

<b>Ценность:</b>
${d.value || '—'}

<b>Сильные стороны:</b>
${Array.isArray(d.strengths) ? d.strengths.map(s => `• ${s}`).join('\n') : '—'}

<b>Слабые места:</b>
${Array.isArray(d.weaknesses) ? d.weaknesses.map(w => `• ${w}`).join('\n') : '—'}

<b>Риск банальности:</b>
${d.banality_risk || '—'}

<b>Конфликт/напряжение:</b>
${d.conflict_or_tension || '—'}

<b>Возможность:</b>
${d.content_opportunity || '—'}

<b>Рекомендация:</b>
${d.recommended_direction || '—'}
`;
}

function formatReel(reel) {
  if (!reel) return 'Reel не найден.';
  let text = `<b>🎬 READY TO SHOOT</b>\n\n<b>${reel.title || 'Reel'}</b>\n\n`;
  if (reel.format) text += `<b>Формат:</b> ${reel.format}\n`;
  if (reel.duration) text += `<b>Длительность:</b> ${reel.duration}\n`;
  if (reel.tempo) text += `<b>Темп:</b> ${reel.tempo}\n`;
  if (reel.visual_principle) text += `<b>Визуал:</b> ${reel.visual_principle}\n`;
  text += '\n';

  if (Array.isArray(reel.scenes)) {
    text += '<b>🎥 СЦЕНЫ</b>\n\n';
    reel.scenes.forEach((scene, i) => {
      text += `<b>СЦЕНА ${i + 1}</b>\n`;
      if (scene.what_to_shoot) text += `📹 Что снять: ${scene.what_to_shoot}\n`;
      if (scene.creator_action) text += `👤 Действие: ${scene.creator_action}\n`;
      if (scene.dialogue) text += `🗣 Что сказать: ${scene.dialogue}\n`;
      if (scene.on_screen_text) text += `📝 Текст на экране: ${scene.on_screen_text}\n`;
      if (scene.why) text += `🎯 Зачем: ${scene.why}\n`;
      text += '\n';
    });
  }

  if (reel.full_script) text += `<b>🗣 ПОЛНЫЙ ТЕКСТ</b>\n\n${reel.full_script}\n\n`;
  if (reel.caption) text += `<b>✍️ ПОДПИСЬ</b>\n${reel.caption}`;
  return text;
}

// ============================================================
// ОСНОВНЫЕ ФУНКЦИИ БОТА
// ============================================================
async function showStart(chatId) {
  await sendMessage(
    chatId,
    `<b>REELS BUILDER 2.2</b>

Твой AI-SMMщик и Reels-продюсер.

<b>Что умею:</b>
🎬 Создать Reel из идеи
💡 Придумать идеи
🔥 Анализировать тренды
📚 Хранить твои Reels
👤 Настраивать профиль

<b>Начнём?</b>`,
    { reply_markup: mainKeyboard() }
  );
}

async function startIdea(chatId, userId) {
  const user = getUser(userId);
  resetCurrentReel(user);
  user.mode = 'waiting_goal';
  await sendMessage(chatId, '<b>🎬 СОЗДАЁМ REEL</b>\n\nСначала выбери главную цель.', {
    reply_markup: goalsKeyboard(),
  });
}

async function askForIdea(chatId, userId) {
  const user = getUser(userId);
  user.mode = 'waiting_idea';
  await sendMessage(
    chatId,
    `<b>Отлично.</b>\n\nТеперь просто напиши свою идею.\n\n<i>«Хочу рассказать, почему люди бросают спорт»</i>`
  );
}

async function processIdea(chatId, userId, idea) {
  const user = getUser(userId);
  user.idea = idea;
  user.mode = 'processing';

  await sendMessage(chatId, '🧠 <b>Разбираю идею...</b>');

  try {
    const diagnosis = await diagnoseIdea({ idea, goal: user.goal, profile: user.profile });
    user.diagnosis = diagnosis;

    await sendLongMessage(chatId, formatDiagnosis(diagnosis), {
      reply_markup: afterDiagnosisKeyboard(),
    });

    user.mode = 'diagnosed';
  } catch (error) {
    console.error('❌ processIdea error:', error.message);
    user.mode = 'waiting_idea';
    await sendMessage(chatId, '❌ Не получилось разобрать идею. Попробуй ещё раз.', {
      reply_markup: mainKeyboard(),
    });
  }
}

async function createConcepts(chatId, userId) {
  const user = getUser(userId);
  if (!user.diagnosis) {
    await sendMessage(chatId, 'Сначала нужно разобрать идею.');
    return;
  }

  user.mode = 'processing';
  await sendMessage(chatId, '💡 <b>Придумываю концепции...</b>');

  try {
    const result = await generateConcepts({
      idea: user.idea,
      diagnosis: user.diagnosis,
      goal: user.goal,
      profile: user.profile,
    });
    user.concepts = result;

    const concepts = result.concepts || [];
    let text = '<b>💡 3 КОНЦЕПЦИИ</b>\n\n';
    concepts.slice(0, 3).forEach((c, i) => {
      text += `<b>${i + 1}. ${c.title || 'Концепция'}</b>\n`;
      if (c.core_idea) text += `${c.core_idea}\n`;
      if (c.why_it_works) text += `💡 Почему: ${c.why_it_works}\n`;
      text += '\n';
    });

    await sendLongMessage(chatId, text, { reply_markup: conceptsKeyboard(concepts) });
    user.mode = 'concepts';
  } catch (error) {
    console.error('❌ createConcepts error:', error.message);
    user.mode = 'diagnosed';
    await sendMessage(chatId, '❌ Не получилось создать концепции.', {
      reply_markup: afterDiagnosisKeyboard(),
    });
  }
}

async function selectConcept(chatId, userId, index) {
  const user = getUser(userId);
  const concepts = user.concepts?.concepts || [];
  const concept = concepts[index];
  if (!concept) {
    await sendMessage(chatId, 'Не нашёл эту концепцию.');
    return;
  }

  user.concept = concept;
  user.mode = 'processing';
  await sendMessage(chatId, '🎯 <b>Концепция выбрана.</b>\n\nПодбираю хуки...');

  try {
    const hooks = await generateHooks({
      idea: user.idea,
      concept: concept,
      goal: user.goal,
      profile: user.profile,
    });
    user.hooks = hooks;

    const hookList = hooks.hooks || [];
    let text = '<b>🎯 3 ХУКА</b>\n\n';
    hookList.slice(0, 3).forEach((h, i) => {
      text += `<b>${i + 1}. ${h.text || 'Хук'}</b>\n`;
      if (h.mechanism) text += `📌 Механика: ${h.mechanism}\n`;
      if (h.why) text += `💡 Почему: ${h.why}\n`;
      text += '\n';
    });

    await sendLongMessage(chatId, text, { reply_markup: hooksKeyboard(hookList) });
    user.mode = 'hooks';
  } catch (error) {
    console.error('❌ selectConcept error:', error.message);
    user.mode = 'concepts';
    await sendMessage(chatId, '❌ Не получилось подобрать хуки.', {
      reply_markup: conceptsKeyboard(concepts),
    });
  }
}

async function selectHook(chatId, userId, index) {
  const user = getUser(userId);
  const hooks = user.hooks?.hooks || [];
  const hook = hooks[index];
  if (!hook) {
    await sendMessage(chatId, 'Не нашёл этот хук.');
    return;
  }

  user.hook = hook;
  user.mode = 'processing';
  await sendMessage(chatId, '🎬 <b>Собираю Reel...</b>');

  try {
    const reel = await buildReel({
      idea: user.idea,
      concept: user.concept,
      hook: hook,
      goal: user.goal,
      profile: user.profile,
    });
    user.reel = reel;

    await sendLongMessage(chatId, formatReel(reel), { reply_markup: reelKeyboard() });
    user.mode = 'reel_ready';
  } catch (error) {
    console.error('❌ selectHook error:', error.message);
    user.mode = 'hooks';
    await sendMessage(chatId, '❌ Не получилось собрать Reel.', {
      reply_markup: hooksKeyboard(hooks),
    });
  }
}

async function strengthen(chatId, userId) {
  const user = getUser(userId);
  if (!user.reel) {
    await sendMessage(chatId, 'Сначала создай Reel.');
    return;
  }

  user.mode = 'processing';
  await sendMessage(chatId, '🔥 <b>Ищу главную слабость...</b>');

  try {
    const stronger = await strengthenReel({
      idea: user.idea,
      diagnosis: user.diagnosis,
      concept: user.concept,
      hook: user.hook,
      reel: user.reel,
      goal: user.goal,
      profile: user.profile,
    });
    user.reel = stronger;

    await sendLongMessage(chatId, `<b>🔥 REEL УСИЛЕН</b>\n\n${formatReel(stronger)}`, {
      reply_markup: reelKeyboard(),
    });
    user.mode = 'reel_ready';
  } catch (error) {
    console.error('❌ strengthen error:', error.message);
    user.mode = 'reel_ready';
    await sendMessage(chatId, '❌ Не получилось усилить Reel.', { reply_markup: reelKeyboard() });
  }
}

async function noIdea(chatId, userId) {
  const user = getUser(userId);
  user.mode = 'processing';
  await sendMessage(chatId, '💡 <b>Придумываю идеи...</b>');

  try {
    const result = await generateNoIdea({ goal: user.goal, profile: user.profile });
    const ideas = result.ideas || [];

    let text = '<b>💡 ЧТО СНЯТЬ</b>\n\n';
    ideas.slice(0, 3).forEach((idea, i) => {
      text += `<b>${i + 1}. ${idea.title || 'Идея'}</b>\n`;
      if (idea.idea) text += `${idea.idea}\n`;
      if (idea.why) text += `💡 Почему: ${idea.why}\n`;
      text += '\n';
    });

    await sendLongMessage(chatId, text, { reply_markup: mainKeyboard() });
    user.mode = null;
  } catch (error) {
    console.error('❌ noIdea error:', error.message);
    user.mode = null;
    await sendMessage(chatId, '❌ Не получилось придумать идеи.', { reply_markup: mainKeyboard() });
  }
}

async function showSaved(chatId, userId) {
  const user = getUser(userId);
  if (!user.savedReels.length) {
    await sendMessage(chatId, '<b>📚 МОИ REELS</b>\n\nЗдесь пока пусто.', {
      reply_markup: mainKeyboard(),
    });
    return;
  }

  await sendMessage(
    chatId,
    `<b>📚 МОИ REELS</b>\n\nСохранено: <b>${user.savedReels.length}</b>`,
    { reply_markup: savedKeyboard(user.savedReels) }
  );
}

async function openSaved(chatId, userId, index) {
  const user = getUser(userId);
  const reel = user.savedReels[index];
  if (!reel) {
    await sendMessage(chatId, 'Этот Reel не найден.');
    return;
  }
  user.reel = reel;
  await sendLongMessage(chatId, `<b>📚 СОХРАНЁННЫЙ REEL</b>\n\n${formatReel(reel)}`, {
    reply_markup: reelKeyboard(),
  });
}

async function saveCurrentReel(chatId, userId) {
  const user = getUser(userId);
  if (!user.reel) {
    await sendMessage(chatId, 'Сначала создай Reel.');
    return;
  }

  user.savedReels.unshift({ ...user.reel, savedAt: new Date().toISOString() });
  user.savedReels = user.savedReels.slice(0, 20);

  await sendMessage(chatId, '💾 <b>Reel сохранён.</b>', { reply_markup: mainKeyboard() });
}

async function showProfile(chatId, userId) {
  const user = getUser(userId);
  await sendMessage(
    chatId,
    `<b>👤 ПРОФИЛЬ</b>\n\n<b>Ниша:</b> ${user.profile.niche || 'не указана'}\n<b>Аудитория:</b> ${user.profile.audience || 'не указана'}\n<b>Стиль:</b> ${user.profile.style || 'не указан'}\n<b>Тон:</b> ${user.profile.tone || 'не указан'}\n<b>Цель:</b> ${user.goal}`,
    { reply_markup: mainKeyboard() }
  );
}

async function handleTrends(chatId, userId, text) {
  const topic = text.replace('/trends', '').trim();
  if (!topic) {
    await sendMessage(chatId, '📊 Напиши тему, например: /trends нейросети');
    return;
  }

  await sendMessage(chatId, '🔍 <b>Анализирую тренды...</b>\n\nЭто займёт ~30 секунд.');

  try {
    const result = await analyzeTrends(topic);
    await sendLongMessage(chatId, `📊 <b>ТРЕНДЫ: ${topic}</b>\n\n${result}`, {
      reply_markup: mainKeyboard(),
    });
  } catch (error) {
    console.error('❌ Trends error:', error.message);
    await sendMessage(chatId, '❌ Не получилось проанализировать тренды.', {
      reply_markup: mainKeyboard(),
    });
  }
}

// ============================================================
// ОБРАБОТКА МЕДИАФАЙЛОВ (ВИДЕО, АУДИО, ИЗОБРАЖЕНИЯ)
// ============================================================
async function handleMedia(chatId, fileId, type, mimeType = null) {
  try {
    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    let text = '';

    if (type === 'photo') {
      await sendMessage(chatId, '🖼️ Распознаю изображение...');
      text = await recognizeImage(buffer);
    } else if (type === 'voice') {
      await sendMessage(chatId, '🎤 Распознаю голосовое сообщение...');
      text = await recognizeAudio(buffer);
    } else if (type === 'video') {
      await sendMessage(chatId, '🎬 Обрабатываю видео...');
      text = await processVideo(buffer);
    } else if (type === 'document' && mimeType?.startsWith('image/')) {
      await sendMessage(chatId, '🖼️ Распознаю документ...');
      text = await recognizeImage(buffer);
    } else {
      await sendMessage(chatId, '❌ Неподдерживаемый тип файла.');
      return;
    }

    await sendMessage(chatId, `📝 <b>Распознанный текст:</b>\n\n${text}`);

    // Предлагаем создать Reel на основе распознанного текста
    await sendMessage(
      chatId,
      `💡 Хочешь создать Reel на основе этого текста? Просто напиши "да" или отправь новую идею.`
    );
  } catch (error) {
    console.error(`❌ Ошибка обработки ${type}:`, error.message);
    await sendMessage(chatId, `❌ Не удалось обработать файл. Попробуй ещё раз.`);
  }
}

// ============================================================
// КОЛБЭКИ
// ============================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;
  const userId = query.from?.id;
  const data = query.data;

  if (!chatId || !userId) return;

  try {
    await bot.answerCallbackQuery(query.id);

    const user = getUser(userId);
    if (data === 'home') {
      user.mode = null;
      await showStart(chatId);
      return;
    }

    if (data.startsWith('goal_')) {
      const goals = {
        goal_reach: 'Охват',
        goal_follow: 'Подписчики',
        goal_save: 'Сохранения',
        goal_comments: 'Комментарии',
        goal_trust: 'Доверие',
        goal_sale: 'Продажа',
      };
      user.goal = goals[data] || 'Охват';
      await askForIdea(chatId, userId);
      return;
    }

    if (data === 'concepts') {
      await createConcepts(chatId, userId);
      return;
    }

    if (data.startsWith('concept_')) {
      const index = parseInt(data.replace('concept_', ''));
      await selectConcept(chatId, userId, index);
      return;
    }

    if (data.startsWith('hook_')) {
      const index = parseInt(data.replace('hook_', ''));
      await selectHook(chatId, userId, index);
      return;
    }

    if (data === 'strengthen') {
      await strengthen(chatId, userId);
      return;
    }

    if (data === 'save_reel') {
      await saveCurrentReel(chatId, userId);
      return;
    }

    if (data === 'new_reel') {
      await startIdea(chatId, userId);
      return;
    }

    if (data.startsWith('open_saved_')) {
      const index = parseInt(data.replace('open_saved_', ''));
      await openSaved(chatId, userId, index);
      return;
    }
  } catch (error) {
    console.error('❌ Callback error:', error.message);
    await sendMessage(chatId, '❌ Что-то пошло не так.', { reply_markup: mainKeyboard() });
  }
});

// ============================================================
// ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ
// ============================================================
bot.on('message', async (msg) => {
  if (!msg.text && !msg.photo && !msg.video && !msg.voice && !msg.document) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim() || '';
  const user = getUser(userId);

  // --- КОМАНДЫ ---
  if (text === '/start') {
    resetCurrentReel(user);
    await showStart(chatId);
    return;
  }

  if (text === '/help') {
    await showStart(chatId);
    return;
  }

  if (text === '/saved') {
    await showSaved(chatId, userId);
    return;
  }

  if (text.startsWith('/trends')) {
    await handleTrends(chatId, userId, text);
    return;
  }

  // --- МЕДИАФАЙЛЫ (ПРИОРИТЕТ) ---
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    await handleMedia(chatId, photo.file_id, 'photo');
    return;
  }

  if (msg.video) {
    await handleMedia(chatId, msg.video.file_id, 'video');
    return;
  }

  if (msg.voice) {
    await handleMedia(chatId, msg.voice.file_id, 'voice');
    return;
  }

  if (msg.document && msg.document.mime_type?.startsWith('image/')) {
    await handleMedia(chatId, msg.document.file_id, 'document', msg.document.mime_type);
    return;
  }

  // --- ТЕКСТОВЫЕ КНОПКИ МЕНЮ ---
  if (text === '🎬 СОЗДАТЬ REEL') {
    await startIdea(chatId, userId);
    return;
  }

  if (text === '💡 ИДЕИ') {
    await noIdea(chatId, userId);
    return;
  }

  if (text === '🔥 ТРЕНДЫ') {
    await sendMessage(
      chatId,
      '📊 Напиши тему в формате: /trends нейросети\n\nНапример: /trends маркетинг 2026'
    );
    return;
  }

  if (text === '📚 МОИ REELS') {
    await showSaved(chatId, userId);
    return;
  }

  if (text === '👤 ПРОФИЛЬ') {
    await showProfile(chatId, userId);
    return;
  }

  // --- ОБРАБОТКА ИДЕИ ---
  if (user.mode === 'waiting_idea') {
    await processIdea(chatId, userId, text);
    return;
  }

  // --- ПОИСКОВЫЙ ЗАПРОС (ПРОСТОЙ ВОПРОС) ---
  const questionWords = ['кто', 'что', 'где', 'когда', 'почему', 'зачем', 'как', 'сколько', 'какой'];
  const isQuestion = questionWords.some(w => text.toLowerCase().startsWith(w)) || text.includes('?');

  if (isQuestion && user.mode !== 'processing') {
    await sendMessage(chatId, '🔍 <b>Ищу информацию...</b>');
    try {
      const result = await searchAndAnswer(text);
      const response = `${result.answer}\n\n📎 Источники:\n${result.sources.map(s => `• ${s}`).join('\n')}`;
      await sendLongMessage(chatId, response, { reply_markup: mainKeyboard() });
    } catch (error) {
      console.error('❌ Search error:', error.message);
      await sendMessage(chatId, '❌ Не удалось найти информацию.', { reply_markup: mainKeyboard() });
    }
    return;
  }

  // --- ПО УМОЛЧАНИЮ ---
  await sendMessage(chatId, 'Выбери действие в меню ниже 👇', { reply_markup: mainKeyboard() });
});

// ============================================================
// ВЕБ-СЕРВЕР (HEALTHCHECK)
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'REELS BUILDER 2.2', mode: 'polling' });
});

app.get('/health', async (req, res) => {
  try {
    const result = await healthcheck();
    res.json({ status: 'ok', telegram: 'running', yandex: result });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// ============================================================
// ЗАПУСК
// ============================================================
app.listen(PORT, () => {
  console.log('=======================================');
  console.log('🚀 REELS BUILDER 2.2');
  console.log('=======================================');
  console.log(`🌐 PORT: ${PORT}`);
  console.log('🔄 TELEGRAM: polling');
  console.log('🤖 AI: YandexGPT + Search + Vision + SpeechKit');
  console.log('=======================================');

  healthcheck()
    .then((result) => console.log('🧠 Yandex health:', result))
    .catch((error) => console.error('❌ Yandex health error:', error.message));
});

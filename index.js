const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const {
  diagnoseIdea,
  generateConcepts,
  generateHooks,
  buildReel,
  strengthenReel,
  generateNoIdea
} = require("./src/producer");
const { healthcheck } = require("./src/yandex");

require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN не найден");
  process.exit(1);
}

/* =========================================================
   TELEGRAM
========================================================= */

const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: true
});

console.log("✅ Telegram бот запущен");

bot.on("polling_error", (error) => {
  console.error("❌ Telegram polling error:", error.message);
});

/* =========================================================
   USERS
========================================================= */

const users = new Map();

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      mode: null,

      idea: "",
      goal: "Охват",

      diagnosis: null,

      concepts: null,
      concept: null,

      hooks: null,
      hook: null,

      reel: null,

      savedReels: [],

      profile: {
        niche: "",
        audience: "",
        style: "",
        tone: ""
      }
    });
  }

  return users.get(userId);
}

/* =========================================================
   HELPERS
========================================================= */

async function sendMessage(chatId, text, extra = {}) {
  try {
    const options = {
      parse_mode: "HTML",
      ...extra
    };

    await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error("❌ Ошибка sendMessage:", error.message);
  }
}

async function safeAnswerCallback(callbackQueryId) {
  try {
    await bot.answerCallbackQuery(callbackQueryId);
  } catch (error) {
    console.error("Callback error:", error.message);
  }
}

/*
 * Telegram ограничивает сообщение примерно 4096 символами.
 * Длинные сценарии поэтому режем автоматически.
 */
async function sendLongMessage(chatId, text, extra = {}) {
  const MAX_LENGTH = 3900;

  if (!text) {
    return;
  }

  if (text.length <= MAX_LENGTH) {
    await sendMessage(chatId, text, extra);
    return;
  }

  let remaining = text;

  while (remaining.length > MAX_LENGTH) {
    let cut = remaining.lastIndexOf("\n", MAX_LENGTH);

    if (cut < 1000) {
      cut = MAX_LENGTH;
    }

    const part = remaining.slice(0, cut);

    await sendMessage(chatId, part, extra);

    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    await sendMessage(chatId, remaining, extra);
  }
}

/* =========================================================
   MAIN TELEGRAM KEYBOARD
========================================================= */

function mainKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "🎬 СОЗДАТЬ REEL"
        },
        {
          text: "💡 ИДЕИ"
        }
      ],
      [
        {
          text: "🔥 ТРЕНДЫ"
        },
        {
          text: "📚 МОИ REELS"
        }
      ],
      [
        {
          text: "👤 ПРОФИЛЬ"
        }
      ]
    ],

    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false
  };
}

/* =========================================================
   GOALS
========================================================= */

function goalsKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Охват",
          callback_data: "goal_reach"
        },
        {
          text: "👥 Подписчики",
          callback_data: "goal_follow"
        }
      ],
      [
        {
          text: "💾 Сохранения",
          callback_data: "goal_save"
        },
        {
          text: "💬 Комментарии",
          callback_data: "goal_comments"
        }
      ],
      [
        {
          text: "🤝 Доверие",
          callback_data: "goal_trust"
        },
        {
          text: "💰 Продажа",
          callback_data: "goal_sale"
        }
      ]
    ]
  };
}

/* =========================================================
   DIAGNOSIS
========================================================= */

function afterDiagnosisKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "💡 ПОКАЗАТЬ КОНЦЕПЦИИ",
          callback_data: "concepts"
        }
      ],
      [
        {
          text: "🎬 НОВАЯ ИДЕЯ",
          callback_data: "new_reel"
        }
      ],
      [
        {
          text: "🏠 ГЛАВНОЕ МЕНЮ",
          callback_data: "home"
        }
      ]
    ]
  };
}

/* =========================================================
   CONCEPTS
========================================================= */

function conceptsKeyboard(concepts) {
  const keyboard = [];

  if (Array.isArray(concepts)) {
    concepts.slice(0, 3).forEach((concept, index) => {
      keyboard.push([
        {
          text: `${index + 1}. ${concept.title || "Концепция"}`,
          callback_data: `concept_${index}`
        }
      ]);
    });
  }

  keyboard.push([
    {
      text: "🏠 ГЛАВНОЕ МЕНЮ",
      callback_data: "home"
    }
  ]);

  return {
    inline_keyboard: keyboard
  };
}

/* =========================================================
   HOOKS
========================================================= */

function hooksKeyboard(hooks) {
  const keyboard = [];

  if (Array.isArray(hooks)) {
    hooks.slice(0, 3).forEach((hook, index) => {
      keyboard.push([
        {
          text: `🎯 ${index + 1}. ${hook.text || "Хук"}`,
          callback_data: `hook_${index}`
        }
      ]);
    });
  }

  keyboard.push([
    {
      text: "🏠 ГЛАВНОЕ МЕНЮ",
      callback_data: "home"
    }
  ]);

  return {
    inline_keyboard: keyboard
  };
}

/* =========================================================
   REEL ACTIONS
========================================================= */

function reelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🔥 СДЕЛАТЬ СИЛЬНЕЕ",
          callback_data: "strengthen"
        }
      ],
      [
        {
          text: "💾 СОХРАНИТЬ REEL",
          callback_data: "save_reel"
        }
      ],
      [
        {
          text: "🎬 НОВЫЙ REEL",
          callback_data: "new_reel"
        }
      ],
      [
        {
          text: "🏠 ГЛАВНОЕ МЕНЮ",
          callback_data: "home"
        }
      ]
    ]
  };
}

/* =========================================================
   SAVED
========================================================= */

function savedKeyboard(reels) {
  const keyboard = [];

  if (Array.isArray(reels)) {
    reels.forEach((reel, index) => {
      keyboard.push([
        {
          text: `🎬 REEL ${index + 1}`,
          callback_data: `open_saved_${index}`
        }
      ]);
    });
  }

  keyboard.push([
    {
      text: "🏠 ГЛАВНОЕ МЕНЮ",
      callback_data: "home"
    }
  ]);

  return {
    inline_keyboard: keyboard
  };
}

/* =========================================================
   PROFILE
========================================================= */

function profileKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "✏️ НАСТРОИТЬ ПРОФИЛЬ",
          callback_data: "profile_edit"
        }
      ],
      [
        {
          text: "🏠 ГЛАВНОЕ МЕНЮ",
          callback_data: "home"
        }
      ]
    ]
  };
}

/* =========================================================
   START
========================================================= */

async function showStart(chatId) {
  await sendMessage(
    chatId,
    `<b>REELS BUILDER</b>

Твой AI-SMMщик и Reels-продюсер.

Не просто пишет текст.

Он разбирает идею, находит слабые места, предлагает концепции, выбирает механику, строит Reel и объясняет, почему именно так.

<b>Что можно сделать:</b>

🎬 Создать Reel из своей идеи
💡 Получить идеи, когда ничего не приходит в голову
🔥 Разобраться с трендами
📚 Хранить свои готовые Reels
👤 Настроить контекст автора

<b>Начнём?</b>`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   CREATE REEL
========================================================= */

async function startIdea(chatId, userId) {
  const user = getUser(userId);

  user.mode = "waiting_goal";
  user.idea = "";
  user.diagnosis = null;
  user.concepts = null;
  user.concept = null;
  user.hooks = null;
  user.hook = null;
  user.reel = null;

  await sendMessage(
    chatId,
    `<b>🎬 СОЗДАЁМ REEL</b>

Сначала определим главную задачу.

Что тебе сейчас важнее всего?`,
    {
      reply_markup: goalsKeyboard()
    }
  );
}

async function askForIdea(chatId, userId) {
  const user = getUser(userId);

  user.mode = "waiting_idea";

  await sendMessage(
    chatId,
    `<b>Отлично.</b>

Теперь просто напиши свою идею.

Не нужно красиво формулировать.

Можно написать хоть так:

<i>«Хочу рассказать, почему люди неправильно делают X»</i>

или

<i>«Хочу снять Reel про мой путь в бизнесе»</i>

Я сам разберу смысл и предложу, как превратить это в сильный Reel.`
  );
}

/* =========================================================
   PROCESS IDEA
========================================================= */

async function processIdea(chatId, userId, idea) {
  const user = getUser(userId);

  user.idea = idea;
  user.mode = "processing";

  await sendMessage(
    chatId,
    "🧠 <b>Разбираю идею...</b>\n\nСмотрю не только на текст, а на смысл, аудиторию, цель и потенциальную механику Reel."
  );

  try {
    const diagnosis = await diagnoseIdea({
      idea,
      goal: user.goal,
      profile: user.profile
    });

    user.diagnosis = diagnosis;

    await sendLongMessage(
      chatId,
      `<b>🔎 РАЗБОР ИДЕИ</b>

<b>Что ты хочешь сказать:</b>
${diagnosis.what_author_wants_to_say || "—"}

<b>Для кого:</b>
${diagnosis.audience || "—"}

<b>Цель:</b>
${diagnosis.goal || user.goal}

<b>Ценность:</b>
${diagnosis.value || "—"}

<b>Что уже хорошо:</b>
${formatList(diagnosis.strengths)}

<b>Что слабое:</b>
${formatList(diagnosis.weaknesses)}

<b>Риск банальности:</b>
${diagnosis.banality_risk || "—"}

<b>Конфликт / напряжение:</b>
${diagnosis.conflict_or_tension || "—"}

<b>Возможность для контента:</b>
${diagnosis.content_opportunity || "—"}

<b>Моя рекомендация:</b>
${diagnosis.recommended_direction || "—"}`,
      {
        reply_markup: afterDiagnosisKeyboard()
      }
    );

    user.mode = "diagnosed";
  } catch (error) {
    console.error("❌ processIdea:", error);

    user.mode = "waiting_idea";

    await sendMessage(
      chatId,
      `❌ Не получилось разобрать идею.

Попробуй отправить её ещё раз.`,
      {
        reply_markup: mainKeyboard()
      }
    );
  }
}

function formatList(value) {
  if (!value) return "—";

  if (Array.isArray(value)) {
    return value.map((item) => `• ${item}`).join("\n");
  }

  return String(value);
}

/* =========================================================
   CONCEPTS
========================================================= */

async function createConcepts(chatId, userId) {
  const user = getUser(userId);

  if (!user.diagnosis) {
    await sendMessage(chatId, "Сначала нужно разобрать идею.");
    return;
  }

  user.mode = "processing";

  await sendMessage(
    chatId,
    "💡 <b>Придумываю концепции...</b>\n\nНе просто три разных заголовка — три разных способа построить сам Reel."
  );

  try {
    const result = await generateConcepts({
      idea: user.idea,
      diagnosis: user.diagnosis,
      goal: user.goal,
      profile: user.profile
    });

    user.concepts = result;

    const concepts = Array.isArray(result)
      ? result
      : result.concepts || [];

    const recommended =
      !Array.isArray(result) && result.recommended
        ? result.recommended
        : null;

    let text = `<b>💡 3 КОНЦЕПЦИИ</b>\n\n`;

    concepts.slice(0, 3).forEach((concept, index) => {
      text += `<b>${index + 1}. ${concept.title || "Концепция"}</b>\n`;

      if (concept.mechanic) {
        text += `Механика: ${concept.mechanic}\n`;
      }

      if (concept.description) {
        text += `${concept.description}\n`;
      }

      if (concept.why) {
        text += `Почему: ${concept.why}\n`;
      }

      text += "\n";
    });

    if (recommended) {
      text += `<b>🎯 Я бы выбрал:</b>\n${recommended}`;
    }

    await sendLongMessage(chatId, text, {
      reply_markup: conceptsKeyboard(concepts)
    });

    user.mode = "concepts";
  } catch (error) {
    console.error("❌ createConcepts:", error);

    user.mode = "diagnosed";

    await sendMessage(
      chatId,
      "❌ Не получилось создать концепции. Попробуй ещё раз.",
      {
        reply_markup: afterDiagnosisKeyboard()
      }
    );
  }
}

/* =========================================================
   SELECT CONCEPT
========================================================= */

async function selectConcept(chatId, userId, index) {
  const user = getUser(userId);

  const concepts = Array.isArray(user.concepts)
    ? user.concepts
    : user.concepts?.concepts || [];

  const concept = concepts[index];

  if (!concept) {
    await sendMessage(chatId, "Не нашёл эту концепцию.");
    return;
  }

  user.concept = concept;
  user.mode = "processing";

  await sendMessage(
    chatId,
    "🎯 <b>Концепция выбрана.</b>\n\nТеперь подбираю хуки, которые реально соответствуют этой механике."
  );

  try {
    const hooks = await generateHooks({
      idea: user.idea,
      diagnosis: user.diagnosis,
      concept: user.concept,
      goal: user.goal,
      profile: user.profile
    });

    user.hooks = hooks;

    const hookList = Array.isArray(hooks)
      ? hooks
      : hooks.hooks || [];

    await sendLongMessage(
      chatId,
      `<b>🎯 3 ХУКА</b>

Каждый хук использует немного другой механизм удержания внимания.

Выбери тот, который больше подходит тебе:`,
      {
        reply_markup: hooksKeyboard(hookList)
      }
    );

    user.mode = "hooks";
  } catch (error) {
    console.error("❌ selectConcept:", error);

    user.mode = "concepts";

    await sendMessage(
      chatId,
      "❌ Не получилось подобрать хуки.",
      {
        reply_markup: conceptsKeyboard(concepts)
      }
    );
  }
}

/* =========================================================
   SELECT HOOK
========================================================= */

async function selectHook(chatId, userId, index) {
  const user = getUser(userId);

  const hooks = Array.isArray(user.hooks)
    ? user.hooks
    : user.hooks?.hooks || [];

  const hook = hooks[index];

  if (!hook) {
    await sendMessage(chatId, "Не нашёл этот хук.");
    return;
  }

  user.hook = hook;
  user.mode = "processing";

  await sendMessage(
    chatId,
    "🎬 <b>Собираю Reel...</b>\n\nОпределяю формат, длительность, темп, сцены, речь и визуальный принцип."
  );

  try {
    const reel = await buildReel({
      idea: user.idea,
      goal: user.goal,
      diagnosis: user.diagnosis,
      concept: user.concept,
      hook: user.hook,
      profile: user.profile
    });

    user.reel = reel;

    await sendLongMessage(
      chatId,
      formatReel(reel),
      {
        reply_markup: reelKeyboard()
      }
    );

    user.mode = "reel_ready";
  } catch (error) {
    console.error("❌ selectHook:", error);

    user.mode = "hooks";

    await sendMessage(
      chatId,
      "❌ Не получилось собрать Reel.",
      {
        reply_markup: hooksKeyboard(hooks)
      }
    );
  }
}

/* =========================================================
   FORMAT REEL
========================================================= */

function formatReel(reel) {
  if (!reel) {
    return "Reel не найден.";
  }

  let text = `<b>🎬 READY TO SHOOT</b>\n\n`;

  if (reel.title) {
    text += `<b>${reel.title}</b>\n\n`;
  }

  if (reel.format) {
    text += `<b>Формат:</b> ${reel.format}\n`;
  }

  if (reel.duration) {
    text += `<b>Длительность:</b> ${reel.duration}\n`;
  }

  if (reel.tempo) {
    text += `<b>Темп:</b> ${reel.tempo}\n`;
  }

  if (reel.visual_principle) {
    text += `<b>Визуальный принцип:</b> ${reel.visual_principle}\n`;
  }

  text += "\n";

  if (Array.isArray(reel.scenes)) {
    text += "<b>🎥 СЦЕНЫ</b>\n\n";

    reel.scenes.forEach((scene, index) => {
      text += `<b>СЦЕНА ${index + 1}</b>\n`;

      if (scene.what_to_shoot) {
        text += `📹 Что снять: ${scene.what_to_shoot}\n`;
      }

      if (scene.creator_action) {
        text += `👤 Действие: ${scene.creator_action}\n`;
      }

      if (scene.dialogue) {
        text += `🗣 Что сказать: ${scene.dialogue}\n`;
      }

      if (scene.on_screen_text) {
        text += `📝 Текст на экране: ${scene.on_screen_text}\n`;
      }

      if (scene.why) {
        text += `🎯 Зачем: ${scene.why}\n`;
      }

      text += "\n";
    });
  }

  if (reel.full_script) {
    text += `<b>🗣 ПОЛНЫЙ ТЕКСТ</b>\n\n${reel.full_script}\n\n`;
  }

  if (reel.why_this_way) {
    text += `<b>🧠 ПОЧЕМУ Я СДЕЛАЛ ИМЕННО ТАК</b>\n`;
    text += `${formatList(reel.why_this_way)}\n\n`;
  }

  if (reel.do_not_do) {
    text += `<b>⚠️ ЧЕГО Я БЫ НЕ ДЕЛАЛ</b>\n${reel.do_not_do}\n\n`;
  }

  if (reel.caption) {
    text += `<b>✍️ ПОДПИСЬ</b>\n${reel.caption}`;
  }

  return text;
}

/* =========================================================
   STRENGTHEN
========================================================= */

async function strengthen(chatId, userId) {
  const user = getUser(userId);

  if (!user.reel) {
    await sendMessage(chatId, "Сначала создай Reel.");
    return;
  }

  user.mode = "processing";

  await sendMessage(
    chatId,
    "🔥 <b>Ищу главную слабость Reel...</b>\n\nНе буду переписывать всё подряд. Найду одно изменение, которое даст наибольший эффект."
  );

  try {
    const stronger = await strengthenReel({
      idea: user.idea,
      diagnosis: user.diagnosis,
      concept: user.concept,
      hook: user.hook,
      reel: user.reel,
      goal: user.goal,
      profile: user.profile
    });

    user.reel = stronger;

    await sendLongMessage(
      chatId,
      `<b>🔥 REEL СТАЛ СИЛЬНЕЕ</b>

Я изменил только главное.

${formatReel(stronger)}`,
      {
        reply_markup: reelKeyboard()
      }
    );

    user.mode = "reel_ready";
  } catch (error) {
    console.error("❌ strengthen:", error);

    user.mode = "reel_ready";

    await sendMessage(
      chatId,
      "❌ Не получилось усилить Reel.",
      {
        reply_markup: reelKeyboard()
      }
    );
  }
}

/* =========================================================
   NO IDEA
========================================================= */

async function noIdea(chatId, userId) {
  const user = getUser(userId);

  user.mode = "processing";

  await sendMessage(
    chatId,
    "💡 <b>Придумываю, что тебе реально можно снять...</b>\n\nНе дам список из десяти случайных идей. Подберу несколько разных механик и выберу наиболее перспективную."
  );

  try {
    const result = await generateNoIdea({
      goal: user.goal,
      profile: user.profile
    });

    const ideas = Array.isArray(result)
      ? result
      : result.ideas || [];

    let text = "<b>💡 ЧТО СНЯТЬ</b>\n\n";

    ideas.slice(0, 3).forEach((idea, index) => {
      text += `<b>${index + 1}. ${idea.title || "Идея"}</b>\n`;

      if (idea.idea) {
        text += `${idea.idea}\n`;
      }

      if (idea.mechanic) {
        text += `Механика: ${idea.mechanic}\n`;
      }

      if (idea.why) {
        text += `Почему: ${idea.why}\n`;
      }

      text += "\n";
    });

    if (!ideas.length) {
      text += "Пока не удалось подобрать идеи. Попробуй ещё раз.";
    }

    await sendLongMessage(chatId, text, {
      reply_markup: mainKeyboard()
    });

    user.mode = null;
  } catch (error) {
    console.error("❌ noIdea:", error);

    user.mode = null;

    await sendMessage(
      chatId,
      "❌ Не получилось придумать идеи. Попробуй ещё раз.",
      {
        reply_markup: mainKeyboard()
      }
    );
  }
}

/* =========================================================
   SAVED REELS
========================================================= */

async function showSaved(chatId, userId) {
  const user = getUser(userId);

  if (!user.savedReels.length) {
    await sendMessage(
      chatId,
      `<b>📚 МОИ REELS</b>

Здесь пока пусто.

Создай первый Reel и сохрани его.`,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>📚 МОИ REELS</b>

Сохранено: <b>${user.savedReels.length}</b>

Выбери Reel:`,
    {
      reply_markup: savedKeyboard(user.savedReels)
    }
  );
}

async function openSaved(chatId, userId, index) {
  const user = getUser(userId);
  const reel = user.savedReels[index];

  if (!reel) {
    await sendMessage(chatId, "Этот Reel не найден.");
    return;
  }

  await sendLongMessage(
    chatId,
    `<b>📚 СОХРАНЁННЫЙ REEL</b>

${formatReel(reel)}`,
    {
      reply_markup: reelKeyboard()
    }
  );
}

/* =========================================================
   PROFILE
========================================================= */

async function showProfile(chatId, userId) {
  const user = getUser(userId);

  await sendMessage(
    chatId,
    `<b>👤 ПРОФИЛЬ</b>

<b>Ниша:</b>
${user.profile.niche || "не указана"}

<b>Аудитория:</b>
${user.profile.audience || "не указана"}

<b>Стиль:</b>
${user.profile.style || "не указан"}

<b>Тон:</b>
${user.profile.tone || "не указан"}

<b>Цель по умолчанию:</b>
${user.goal}

Это нужно, чтобы со временем REELS BUILDER лучше понимал именно тебя.`,
    {
      reply_markup: profileKeyboard()
    }
  );
}

/* =========================================================
   TRENDS
========================================================= */

async function showTrends(chatId) {
  await sendMessage(
    chatId,
    `<b>🔥 ТРЕНДЫ</b>

Этот раздел будет отвечать не за «случайные трендовые звуки», а за реальные сигналы:

• какие темы сейчас растут;
• какие механики используют creators;
• какие hooks повторяются;
• какие форматы набирают внимание;
• что можно адаптировать именно под твою нишу.

<b>Trend Engine пока подключается.</b>

Я специально не показываю тебе выдуманные «вирусные тренды» без данных.`,
    {
      reply_markup: mainKeyboard()
    }
  );
}

/* =========================================================
   CALLBACKS
========================================================= */

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  await safeAnswerCallback(query.id);

  const user = getUser(userId);

  try {
    /* HOME */

    if (data === "home") {
      user.mode = null;
      await showStart(chatId);
      return;
    }

    /* GOALS */

    if (data.startsWith("goal_")) {
      const goals = {
        goal_reach: "Охват",
        goal_follow: "Подписчики",
        goal_save: "Сохранения",
        goal_comments: "Комментарии",
        goal_trust: "Доверие",
        goal_sale: "Продажа"
      };

      user.goal = goals[data] || "Охват";

      await askForIdea(chatId, userId);
      return;
    }

    /* CONCEPTS */

    if (data === "concepts") {
      await createConcepts(chatId, userId);
      return;
    }

    /* CONCEPT SELECT */

    if (data.startsWith("concept_")) {
      const index = Number(data.replace("concept_", ""));

      await selectConcept(chatId, userId, index);
      return;
    }

    /* HOOK SELECT */

    if (data.startsWith("hook_")) {
      const index = Number(data.replace("hook_", ""));

      await selectHook(chatId, userId, index);
      return;
    }

    /* STRENGTHEN */

    if (data === "strengthen") {
      await strengthen(chatId, userId);
      return;
    }

    /* SAVE */

    if (data === "save_reel") {
      if (!user.reel) {
        await sendMessage(chatId, "Сначала создай Reel.");
        return;
      }

      user.savedReels.push(user.reel);

      await sendMessage(
        chatId,
        "💾 <b>Reel сохранён.</b>\n\nОн появился в разделе «📚 МОИ REELS».",
        {
          reply_markup: mainKeyboard()
        }
      );

      return;
    }

    /* NEW REEL */

    if (data === "new_reel") {
      await startIdea(chatId, userId);
      return;
    }

    /* SAVED */

    if (data.startsWith("open_saved_")) {
      const index = Number(data.replace("open_saved_", ""));

      await openSaved(chatId, userId, index);
      return;
    }

    /* PROFILE */

    if (data === "profile_edit") {
      await sendMessage(
        chatId,
        `<b>👤 НАСТРОЙКА ПРОФИЛЯ</b>

Пока профиль можно будет расширять постепенно.

На следующем этапе добавим полноценную анкету автора:

• ниша
• аудитория
• формат контента
• стиль
• тон общения
• сильные стороны
• цели
• лучшие прошлые Reels`,
        {
          reply_markup: mainKeyboard()
        }
      );

      return;
    }

  } catch (error) {
    console.error("❌ Callback error:", error);

    await sendMessage(
      chatId,
      "❌ Что-то пошло не так. Вернись в главное меню.",
      {
        reply_markup: mainKeyboard()
      }
    );
  }
});

/* =========================================================
   TEXT MESSAGES
========================================================= */

bot.on("message", async (msg) => {
  if (!msg.text) {
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  const user = getUser(userId);

  /* COMMANDS */

  if (text === "/start") {
    user.mode = null;
    await showStart(chatId);
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      `<b>REELS BUILDER</b>

🎬 Создать Reel — провести идею от сырого замысла до готового сценария.

💡 Идеи — если не знаешь, что снимать.

🔥 Тренды — актуальные контентные сигналы.

📚 Мои Reels — сохранённые сценарии.

👤 Профиль — контекст автора.`,
      {
        reply_markup: mainKeyboard()
      }
    );

    return;
  }

  if (text === "/saved") {
    await showSaved(chatId, userId);
    return;
  }

  if (text === "/idea") {
    await startIdea(chatId, userId);
    return;
  }

  if (text === "/status") {
    await sendMessage(
      chatId,
      `<b>REELS BUILDER</b>

Статус: 🟢 работает

AI: YandexGPT
Режим Telegram: polling
Пользовательское состояние: memory`
    );

    return;
  }

  /* MAIN KEYBOARD */

  if (text === "🎬 СОЗДАТЬ REEL") {
    await startIdea(chatId, userId);
    return;
  }

  if (text === "💡 ИДЕИ") {
    await noIdea(chatId, userId);
    return;
  }

  if (text === "🔥 ТРЕНДЫ") {
    await showTrends(chatId);
    return;
  }

  if (text === "📚 МОИ REELS") {
    await showSaved(chatId, userId);
    return;
  }

  if (text === "👤 ПРОФИЛЬ") {
    await showProfile(chatId, userId);
    return;
  }

  /* IDEA INPUT */

  if (user.mode === "waiting_idea") {
    await processIdea(chatId, userId, text);
    return;
  }

  /* DEFAULT */

  await sendMessage(
    chatId,
    `Выбери действие в меню ниже 👇`,
    {
      reply_markup: mainKeyboard()
    }
  );
});

/* =========================================================
   WEB SERVER
========================================================= */

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "REELS BUILDER",
    version: "2.1",
    mode: "polling"
  });
});

app.get("/health", async (req, res) => {
  try {
    const result = await healthcheck();

    res.json({
      status: "ok",
      telegram: "running",
      yandex: result
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log("=======================================");
  console.log("🚀 REELS BUILDER 2.1");
  console.log("=======================================");
  console.log(`🌐 PORT: ${PORT}`);
  console.log("🔄 TELEGRAM: polling");
  console.log("🤖 AI: YandexGPT");
  console.log("=======================================");

  healthcheck()
    .then((result) => {
      console.log("🧠 Yandex health:", result);
    })
    .catch((error) => {
      console.error("❌ Yandex health error:", error.message);
    });
});

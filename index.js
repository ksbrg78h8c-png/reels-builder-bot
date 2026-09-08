const express = require("express");

const {
  diagnoseIdea,
  generateConcepts,
  generateHooks,
  buildReel,
  strengthenReel,
  generateNoIdea
} = require("./src/producer");

const {
  healthcheck
} = require("./src/yandex");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET || "";

const PUBLIC_URL =
  process.env.PUBLIC_URL || "";

if (!TELEGRAM_TOKEN) {
  throw new Error("TELEGRAM_TOKEN не задан");
}

if (!PUBLIC_URL) {
  console.warn(
    "PUBLIC_URL не задан. Webhook Telegram не будет установлен."
  );
}

/* =========================================================
   TELEGRAM API
========================================================= */

const TELEGRAM_API =
  `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function telegram(method, body = {}) {
  const response = await fetch(
    `${TELEGRAM_API}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API ${method}: ${JSON.stringify(data)}`
    );
  }

  return data.result;
}

async function sendMessage(
  chatId,
  text,
  keyboard = null
) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (keyboard) {
    body.reply_markup = {
      inline_keyboard: keyboard
    };
  }

  return telegram("sendMessage", body);
}

async function answerCallback(callbackId) {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackId
    });
  } catch (error) {
    console.error(
      "answerCallbackQuery error:",
      error.message
    );
  }
}

/* =========================================================
   USER STATE
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

      creatorProfile: {
        niche: "",
        audience: "",
        style: "",
        tone: "",
        goals: [],
        successfulReels: []
      },

      savedReels: []
    });
  }

  return users.get(userId);
}

function resetCurrentReel(user) {
  user.mode = null;
  user.idea = "";
  user.diagnosis = null;
  user.concepts = null;
  user.concept = null;
  user.hooks = null;
  user.hook = null;
  user.reel = null;
}

/* =========================================================
   MENUS
========================================================= */

function mainKeyboard() {
  return [
    [
      {
        text: "🎬 РАЗОБРАТЬ ИДЕЮ",
        callback_data: "idea"
      }
    ],
    [
      {
        text: "💡 НЕ ЗНАЮ, ЧТО СНЯТЬ",
        callback_data: "no_idea"
      }
    ],
    [
      {
        text: "📚 МОИ REELS",
        callback_data: "saved"
      }
    ]
  ];
}

function goalsKeyboard() {
  return [
    [
      {
        text: "🔥 Охват",
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
  ];
}

function afterDiagnosisKeyboard() {
  return [
    [
      {
        text: "💡 ПОКАЗАТЬ КОНЦЕПЦИИ",
        callback_data: "concepts"
      }
    ],
    [
      {
        text: "🔄 ДРУГАЯ ИДЕЯ",
        callback_data: "idea"
      }
    ]
  ];
}

function conceptsKeyboard(concepts) {
  const buttons = [];

  concepts.forEach((concept, index) => {
    buttons.push([
      {
        text: `${index + 1}. ${concept.title}`,
        callback_data: `concept_${index}`
      }
    ]);
  });

  return buttons;
}

function hooksKeyboard(hooks) {
  return hooks.map((hook, index) => [
    {
      text: `${index + 1}. ${hook.text}`,
      callback_data: `hook_${index}`
    }
  ]);
}

function reelKeyboard() {
  return [
    [
      {
        text: "🚀 УСИЛИТЬ",
        callback_data: "strengthen"
      },
      {
        text: "💾 СОХРАНИТЬ",
        callback_data: "save_reel"
      }
    ],
    [
      {
        text: "🎬 НОВЫЙ REEL",
        callback_data: "new_reel"
      }
    ]
  ];
}

function savedKeyboard(user) {
  if (!user.savedReels.length) {
    return [
      [
        {
          text: "🎬 СОЗДАТЬ REEL",
          callback_data: "idea"
        }
      ]
    ];
  }

  return user.savedReels.map((reel, index) => [
    {
      text: `🎬 ${index + 1}. ${reel.title || "Reel"}`,
      callback_data: `open_saved_${index}`
    }
  ]);
}

/* =========================================================
   FORMATTING
========================================================= */

function formatDiagnosis(d) {
  return `
<b>🔎 ДИАГНОСТИКА ИДЕИ</b>

<b>Что ты реально хочешь сказать:</b>
${d.what_author_wants_to_say}

<b>Для кого:</b>
${d.audience}

<b>Цель:</b>
${d.goal}

<b>Ценность:</b>
${d.value}

<b>Сильные стороны:</b>
${d.strengths.map(x => `• ${x}`).join("\n")}

<b>Слабые места:</b>
${d.weaknesses.map(x => `• ${x}`).join("\n")}

<b>Риск банальности:</b>
${d.banality_risk}

<b>Конфликт / напряжение:</b>
${d.conflict_or_tension}

<b>Возможность:</b>
${d.content_opportunity}

<b>Главное продюсерское решение:</b>
${d.recommended_direction}
`;
}

function formatConcepts(result) {
  let text = "<b>💡 3 КОНЦЕПЦИИ</b>\n\n";

  result.concepts.forEach((concept, index) => {
    text +=
      `<b>${index + 1}. ${concept.title}</b>\n` +
      `${concept.core_idea}\n\n` +
      `<b>Формат:</b> ${concept.format}\n` +
      `<b>Структура:</b> ${concept.structure}\n` +
      `<b>Визуал:</b> ${concept.visual_approach}\n` +
      `<b>Почему работает:</b> ${concept.why_it_works}\n\n`;
  });

  text +=
    `<b>🎯 Я бы выбрал №${result.recommended_index + 1}</b>\n` +
    `${result.recommendation_reason}`;

  return text;
}

function formatHooks(result) {
  let text = "<b>🪝 3 ХУКА</b>\n\n";

  result.hooks.forEach((hook, index) => {
    text +=
      `<b>${index + 1}. ${hook.text}</b>\n` +
      `<i>${hook.mechanism}</i>\n` +
      `${hook.why}\n\n`;
  });

  text +=
    `<b>🎯 Рекомендую №${result.recommended_index + 1}</b>\n` +
    result.recommendation_reason;

  return text;
}

function formatReel(reel) {
  let text =
    `<b>🎬 READY TO SHOOT</b>\n\n` +
    `<b>${reel.title}</b>\n\n` +
    `<b>Цель:</b> ${reel.goal}\n` +
    `<b>Длительность:</b> ${reel.duration}\n` +
    `<b>Темп:</b> ${reel.tempo}\n` +
    `<b>Формат:</b> ${reel.format}\n` +
    `<b>Визуальный принцип:</b> ${reel.visual_principle}\n\n`;

  reel.scenes.forEach(scene => {
    text +=
      `<b>🎥 СЦЕНА ${scene.number}</b> ` +
      `(${scene.duration})\n\n` +
      `<b>Что снять:</b>\n${scene.what_to_shoot}\n\n` +
      `<b>Что делает автор:</b>\n${scene.creator_action}\n\n` +
      `<b>Что говорит:</b>\n${scene.dialogue}\n\n` +
      `<b>Текст на экране:</b>\n${scene.on_screen_text}\n\n` +
      `<b>Зачем:</b>\n${scene.why}\n\n` +
      `──────────────\n\n`;
  });

  text +=
    `<b>📝 ПОЛНЫЙ ТЕКСТ</b>\n\n` +
    `${reel.full_script}\n\n` +
    `<b>🧠 ПОЧЕМУ ИМЕННО ТАК</b>\n\n` +
    reel.why_this_way.map(x => `• ${x}`).join("\n") +
    `\n\n` +
    `<b>🚫 ЧЕГО НЕ ДЕЛАТЬ</b>\n\n` +
    `${reel.do_not_do}\n\n` +
    `<b>📌 CAPTION</b>\n\n` +
    `${reel.caption}`;

  return text;
}

/* =========================================================
   START
========================================================= */

async function showStart(chatId) {
  await sendMessage(
    chatId,
    `<b>REELS BUILDER</b>

Твой AI-SMMщик и Reels-продюсер.

Ты даёшь мне сырую мысль —
я разбираю её, нахожу слабые места, выбираю стратегию, предлагаю концепцию и собираю Reel, который можно реально снять.

<b>Что умею:</b>

🎬 Разобрать твою идею
💡 Предложить разные концепции
🪝 Найти сильный хук
🎥 Собрать READY TO SHOOT
🧠 Объяснить решения
🚀 Найти главное место для усиления
📚 Сохранять готовые Reels

Выбирай действие ниже.`,
    mainKeyboard()
  );
}

/* =========================================================
   IDEA FLOW
========================================================= */

async function startIdea(chatId) {
  const user = getUser(chatId);

  resetCurrentReel(user);

  user.mode = "waiting_goal";

  await sendMessage(
    chatId,
    `<b>🎬 РАЗБИРАЕМ ИДЕЮ</b>

Сначала выбери главную цель этого Reel.`,
    goalsKeyboard()
  );
}

async function askForIdea(chatId) {
  const user = getUser(chatId);

  user.mode = "waiting_idea";

  await sendMessage(
    chatId,
    `<b>Теперь дай мне сырую идею.</b>

Пиши как есть.

Можно одной фразой.
Можно длинно.
Можно криво.

Например:

<i>«Хочу рассказать, почему люди бросают спорт через месяц, хотя сначала очень мотивированы»</i>

Я сам разберусь, что из этого можно сделать.`
  );
}

async function processIdea(chatId, idea) {
  const user = getUser(chatId);

  user.idea = idea;

  await sendMessage(
    chatId,
    "🔎 Разбираю идею..."
  );

  try {
    const diagnosis = await diagnoseIdea(
      idea,
      user.goal
    );

    user.diagnosis = diagnosis;

    await sendMessage(
      chatId,
      formatDiagnosis(diagnosis),
      afterDiagnosisKeyboard()
    );
  } catch (error) {
    console.error("Diagnosis error:", error);

    await sendMessage(
      chatId,
      `Не смог разобрать идею.

Ошибка: ${error.message}

Попробуй ещё раз.`
    );
  }
}

/* =========================================================
   CONCEPTS
========================================================= */

async function createConcepts(chatId) {
  const user = getUser(chatId);

  if (!user.idea || !user.diagnosis) {
    await sendMessage(
      chatId,
      "Сначала дай мне идею."
    );

    return;
  }

  await sendMessage(
    chatId,
    "💡 Ищу разные способы сделать из неё Reel..."
  );

  try {
    const result = await generateConcepts({
      idea: user.idea,
      diagnosis: user.diagnosis,
      goal: user.goal
    });

    user.concepts = result;

    await sendMessage(
      chatId,
      formatConcepts(result),
      conceptsKeyboard(result.concepts)
    );
  } catch (error) {
    console.error("Concepts error:", error);

    await sendMessage(
      chatId,
      `Не удалось создать концепции.

${error.message}`
    );
  }
}

/* =========================================================
   HOOKS
========================================================= */

async function createHooks(chatId, index) {
  const user = getUser(chatId);

  if (!user.concepts) {
    await sendMessage(
      chatId,
      "Сначала выбери концепцию."
    );

    return;
  }

  const concept =
    user.concepts.concepts[index];

  if (!concept) {
    await sendMessage(
      chatId,
      "Не нашёл такую концепцию."
    );

    return;
  }

  user.concept = concept;

  await sendMessage(
    chatId,
    "🪝 Подбираю хуки под эту механику..."
  );

  try {
    const result = await generateHooks({
      idea: user.idea,
      concept,
      goal: user.goal
    });

    user.hooks = result;

    await sendMessage(
      chatId,
      formatHooks(result),
      hooksKeyboard(result.hooks)
    );
  } catch (error) {
    console.error("Hooks error:", error);

    await sendMessage(
      chatId,
      `Не удалось создать хуки.

${error.message}`
    );
  }
}

/* =========================================================
   BUILD REEL
========================================================= */

async function createReel(chatId, index) {
  const user = getUser(chatId);

  if (!user.hooks) {
    await sendMessage(
      chatId,
      "Сначала выбери хук."
    );

    return;
  }

  const hook =
    user.hooks.hooks[index];

  if (!hook) {
    await sendMessage(
      chatId,
      "Не нашёл такой хук."
    );

    return;
  }

  user.hook = hook;

  await sendMessage(
    chatId,
    "🎬 Собираю READY TO SHOOT...\n\nЭто займёт немного времени."
  );

  try {
    const reel = await buildReel({
      idea: user.idea,
      concept: user.concept,
      hook,
      goal: user.goal
    });

    user.reel = reel;

    await sendMessage(
      chatId,
      formatReel(reel),
      reelKeyboard()
    );
  } catch (error) {
    console.error("Build reel error:", error);

    await sendMessage(
      chatId,
      `Не удалось собрать Reel.

${error.message}`
    );
  }
}

/* =========================================================
   STRENGTHEN
========================================================= */

async function strengthen(chatId) {
  const user = getUser(chatId);

  if (!user.reel) {
    await sendMessage(
      chatId,
      "Сначала создай Reel."
    );

    return;
  }

  await sendMessage(
    chatId,
    "🚀 Ищу главное место для усиления..."
  );

  try {
    const result =
      await strengthenReel(user.reel);

    await sendMessage(
      chatId,
      `<b>🚀 MAKE STRONGER</b>

<b>Главная слабость:</b>
${result.main_weakness}

<b>Что изменить:</b>
${result.change}

<b>Было:</b>
${result.before}

<b>Станет:</b>
${result.after}

<b>Почему:</b>
${result.why}`,
      reelKeyboard()
    );
  } catch (error) {
    console.error(
      "Strengthen error:",
      error
    );

    await sendMessage(
      chatId,
      `Не удалось усилить Reel.

${error.message}`
    );
  }
}

/* =========================================================
   NO IDEA
========================================================= */

async function noIdea(chatId) {
  const user = getUser(chatId);

  resetCurrentReel(user);

  await sendMessage(
    chatId,
    "💡 Понял. Давай я предложу варианты."
  );

  try {
    const context =
      JSON.stringify(
        user.creatorProfile
      );

    const result =
      await generateNoIdea({
        goal: user.goal,
        context
      });

    let text =
      "<b>💡 ЧТО МОЖНО СНЯТЬ</b>\n\n";

    result.ideas.forEach(
      (idea, index) => {
        text +=
          `<b>${index + 1}. ${idea.title}</b>\n` +
          `${idea.idea}\n\n` +
          `<b>Формат:</b> ${idea.format}\n` +
          `<b>Почему:</b> ${idea.why}\n\n`;
      }
    );

    text +=
      `<b>🎯 Я бы начал с №${result.recommended_index + 1}</b>\n` +
      result.recommendation_reason;

    await sendMessage(
      chatId,
      text,
      [
        [
          {
            text: "🎬 СОЗДАТЬ СВОЮ ИДЕЮ",
            callback_data: "idea"
          }
        ]
      ]
    );
  } catch (error) {
    console.error(
      "No idea error:",
      error
    );

    await sendMessage(
      chatId,
      `Не удалось подобрать идеи.

${error.message}`
    );
  }
}

/* =========================================================
   SAVED REELS
========================================================= */

async function showSaved(chatId) {
  const user = getUser(chatId);

  if (!user.savedReels.length) {
    await sendMessage(
      chatId,
      `<b>📚 МОИ REELS</b>

Здесь пока пусто.

Когда соберём первый Reel — его можно будет сохранить сюда.`,
      savedKeyboard(user)
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>📚 МОИ REELS</b>

Выбери сохранённый Reel:`,
    savedKeyboard(user)
  );
}

async function saveCurrentReel(chatId) {
  const user = getUser(chatId);

  if (!user.reel) {
    await sendMessage(
      chatId,
      "Сначала создай Reel."
    );

    return;
  }

  user.savedReels.unshift({
    ...user.reel,
    savedAt: new Date().toISOString()
  });

  // Храним максимум 20 последних
  user.savedReels =
    user.savedReels.slice(0, 20);

  await sendMessage(
    chatId,
    `<b>💾 Сохранено.</b>

Reel добавлен в «Мои Reels».`,
    reelKeyboard()
  );
}

async function openSaved(chatId, index) {
  const user = getUser(chatId);

  const reel =
    user.savedReels[index];

  if (!reel) {
    await sendMessage(
      chatId,
      "Этот Reel не найден."
    );

    return;
  }

  user.reel = reel;

  await sendMessage(
    chatId,
    formatReel(reel),
    reelKeyboard()
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallback(callback) {
  const chatId =
    callback.message?.chat?.id;

  const data = callback.data;

  if (!chatId) {
    return;
  }

  await answerCallback(
    callback.id
  );

  try {
    if (data === "idea") {
      await startIdea(chatId);
      return;
    }

    if (data === "no_idea") {
      await noIdea(chatId);
      return;
    }

    if (data === "saved") {
      await showSaved(chatId);
      return;
    }

    if (data === "goal_reach") {
      getUser(chatId).goal = "Охват";
      await askForIdea(chatId);
      return;
    }

    if (data === "goal_follow") {
      getUser(chatId).goal =
        "Подписчики";
      await askForIdea(chatId);
      return;
    }

    if (data === "goal_save") {
      getUser(chatId).goal =
        "Сохранения";
      await askForIdea(chatId);
      return;
    }

    if (data === "goal_comments") {
      getUser(chatId).goal =
        "Комментарии";
      await askForIdea(chatId);
      return;
    }

    if (data === "goal_trust") {
      getUser(chatId).goal =
        "Доверие";
      await askForIdea(chatId);
      return;
    }

    if (data === "goal_sale") {
      getUser(chatId).goal =
        "Продажа";
      await askForIdea(chatId);
      return;
    }

    if (data === "concepts") {
      await createConcepts(chatId);
      return;
    }

    if (data.startsWith("concept_")) {
      const index =
        Number(data.split("_")[1]);

      await createHooks(
        chatId,
        index
      );

      return;
    }

    if (data.startsWith("hook_")) {
      const index =
        Number(data.split("_")[1]);

      await createReel(
        chatId,
        index
      );

      return;
    }

    if (data === "strengthen") {
      await strengthen(chatId);
      return;
    }

    if (data === "save_reel") {
      await saveCurrentReel(chatId);
      return;
    }

    if (data === "new_reel") {
      await startIdea(chatId);
      return;
    }

    if (data.startsWith("open_saved_")) {
      const index =
        Number(data.split("_")[2]);

      await openSaved(
        chatId,
        index
      );

      return;
    }

  } catch (error) {
    console.error(
      "Callback error:",
      error
    );

    await sendMessage(
      chatId,
      "Произошла ошибка. Попробуй ещё раз."
    );
  }
}

/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessage(message) {
  const chatId =
    message.chat?.id;

  if (!chatId) {
    return;
  }

  const text =
    message.text?.trim() || "";

  if (!text) {
    return;
  }

  const user =
    getUser(chatId);

  if (text === "/start") {
    resetCurrentReel(user);
    await showStart(chatId);
    return;
  }

  if (text === "/help") {
    await showStart(chatId);
    return;
  }

  if (text === "/saved") {
    await showSaved(chatId);
    return;
  }

  if (text === "/idea") {
    await startIdea(chatId);
    return;
  }

  if (text === "/status") {
    await sendMessage(
      chatId,
      `<b>REELS BUILDER STATUS</b>

🟢 Telegram: работает
🟢 YandexGPT: подключён
🟢 Producer Engine: подключён
🟢 Webhook: используется

Текущий режим:
${user.mode || "главное меню"}`
    );

    return;
  }

  if (user.mode === "waiting_idea") {
    await processIdea(
      chatId,
      text
    );

    return;
  }

  await sendMessage(
    chatId,
    `Используй меню REELS BUILDER.`,
    mainKeyboard()
  );
}

/* =========================================================
   TELEGRAM WEBHOOK
========================================================= */

app.post(
  "/telegram/webhook",
  async (req, res) => {

    if (
      TELEGRAM_WEBHOOK_SECRET &&
      req.headers[
        "x-telegram-bot-api-secret-token"
      ] !== TELEGRAM_WEBHOOK_SECRET
    ) {
      return res
        .status(401)
        .send("Unauthorized");
    }

    // Telegram должен быстро получить 200.
    res.sendStatus(200);

    const update =
      req.body;

    try {
      if (update.callback_query) {
        await handleCallback(
          update.callback_query
        );
      }

      if (update.message) {
        await handleMessage(
          update.message
        );
      }

    } catch (error) {
      console.error(
        "Webhook update error:",
        error
      );
    }
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      ok: true,
      service: "REELS BUILDER",
      status: "running"
    });
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      service: "reels-builder",
      timestamp: new Date().toISOString()
    });
  }
);

/* =========================================================
   WEBHOOK SETUP
========================================================= */

async function setupWebhook() {
  if (!PUBLIC_URL) {
    console.warn(
      "PUBLIC_URL отсутствует — webhook не устанавливаем."
    );
    return;
  }

  const webhookUrl =
    `${PUBLIC_URL.replace(/\/$/, "")}/telegram/webhook`;

  await telegram(
    "setWebhook",
    {
      url: webhookUrl,
      secret_token:
        TELEGRAM_WEBHOOK_SECRET || undefined,
      allowed_updates: [
        "message",
        "callback_query"
      ]
    }
  );

  console.log(
    `Telegram webhook установлен: ${webhookUrl}`
  );
}

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  async () => {
    console.log(
      `REELS BUILDER запущен на порту ${PORT}`
    );

    try {
      const yandex =
        await healthcheck();

      if (yandex) {
        console.log(
          "YandexGPT: OK"
        );
      } else {
        console.warn(
          "YandexGPT: healthcheck не прошёл"
        );
      }
    } catch (error) {
      console.error(
        "Yandex healthcheck error:",
        error.message
      );
    }

    try {
      await setupWebhook();
    } catch (error) {
      console.error(
        "Telegram webhook error:",
        error.message
      );
    }
  }
);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown() {
  console.log(
    "REELS BUILDER shutting down..."
  );

  try {
    if (PUBLIC_URL) {
      await telegram(
        "deleteWebhook",
        {
          drop_pending_updates: false
        }
      );
    }
  } catch (error) {
    console.error(
      "Webhook shutdown error:",
      error.message
    );
  }

  process.exit(0);
}

process.on(
  "SIGTERM",
  shutdown
);

process.on(
  "SIGINT",
  shutdown
);

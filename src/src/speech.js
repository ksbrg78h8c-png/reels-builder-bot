const axios = require('axios');
const config = require('./config');

const STT_V1_URL = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize';
const STT_V3_ASYNC_URL = 'https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync';
const STT_V3_STATUS_URL = 'https://stt.api.cloud.yandex.net/stt/v3/getRecognition';

async function recognizeAudio(audioBuffer, lang = 'ru-RU') {
  const apiKey = config.yandex.apiKey;
  const folderId = config.yandex.folderId;

  console.log('🎤 Отправляем аудио в SpeechKit STT v1...');

  try {
    const response = await axios.post(
      STT_V1_URL,
      audioBuffer,
      {
        params: {
          topic: 'general',
          folderId: folderId,
          lang: lang,
        },
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'Content-Type': 'audio/ogg;codecs=opus',
        },
        timeout: 60000,
      }
    );

    const result = response.data?.result || 'Речь не распознана.';
    console.log(`✅ Распознано ${result.length} символов`);
    return result;

  } catch (error) {
    console.error('❌ Ошибка SpeechKit STT:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`SpeechKit STT error: ${error.message}`);
  }
}

async function recognizeAudioAsync(audioUri, lang = 'ru-RU') {
  const apiKey = config.yandex.apiKey;
  const folderId = config.yandex.folderId;

  console.log('🎬 Отправляем аудио в SpeechKit STT v3 (асинхронно)...');

  const body = {
    recognitionModel: {
      model: 'general',
      audioFormat: {
        containerAudio: {
          containerAudioType: 'WAV',
        },
      },
      languageRestriction: {
        restrictionType: 'WHITELIST',
        languageCode: [lang],
      },
    },
    uri: audioUri,
  };

  try {
    const startResponse = await axios.post(
      STT_V3_ASYNC_URL,
      body,
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const operationId = startResponse.data?.id;
    if (!operationId) {
      throw new Error('Не удалось получить operation_id от STT v3');
    }

    console.log(`🔄 Операция ${operationId} запущена, ждём результат...`);

    for (let i = 0; i < 120; i++) {
      const statusResponse = await axios.get(
        STT_V3_STATUS_URL,
        {
          params: { operation_id: operationId },
          headers: {
            'Authorization': `Api-Key ${apiKey}`,
            'x-folder-id': folderId,
          },
          timeout: 30000,
        }
      );

      const statusData = statusResponse.data;
      if (statusData.done) {
        const text = extractSttText(statusData);
        console.log(`✅ Распознано ${text.length} символов`);
        return text;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Превышено время ожидания распознавания STT v3');

  } catch (error) {
    console.error('❌ Ошибка STT v3:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

function extractSttText(data) {
  const parts = [];
  const response = data.response || [];

  for (const chunk of response) {
    const final = chunk.final || {};
    const alternatives = final.alternatives || [];
    for (const alt of alternatives) {
      const words = alt.words || [];
      for (const word of words) {
        if (word.word) {
          parts.push(word.word);
        }
      }
    }
  }

  return parts.join(' ').trim() || 'Речь не распознана.';
}

module.exports = {
  recognizeAudio,
  recognizeAudioAsync,
  extractSttText,
};
const axios = require('axios');
const config = require('./config');

const VISION_URL = 'https://vision.api.cloud.yandex.net/vision/v1/textDetection';

/**
 * Распознаёт текст на изображении через Yandex Vision OCR
 * @param {Buffer} imageBuffer - буфер с изображением
 * @param {string} mimeType - тип изображения (JPEG, PNG, etc.)
 * @param {string} model - 'page' (общий текст) или 'table' (таблицы)
 * @returns {Promise<string>} - распознанный текст
 */
async function recognizeImage(imageBuffer, mimeType = 'JPEG', model = 'page') {
  const folderId = config.yandex.folderId;
  const apiKey = config.yandex.apiKey;

  // Кодируем изображение в base64
  const contentBase64 = imageBuffer.toString('base64');

  const payload = {
    mimeType: mimeType,
    languageCodes: ['*'], // автоопределение языка
    model: model,
    content: contentBase64,
  };

  console.log(`🖼️ Отправляем изображение в Vision OCR...`);

  try {
    const response = await axios.post(
      VISION_URL,
      payload,
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    // Ответ приходит в формате JSONL — по строке на объект
    const lines = response.data.split('\n').filter(line => line.trim());
    let fullText = '';

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const blocks = obj?.result?.textDetection?.blocks || [];
        for (const block of blocks) {
          for (const word of block.words || []) {
            if (word.text) {
              fullText += word.text + ' ';
            }
          }
        }
      } catch (e) {
        // Игнорируем пустые строки
      }
    }

    const result = fullText.trim() || 'Текст на изображении не обнаружен.';
    console.log(`✅ Распознано ${result.length} символов`);
    return result;

  } catch (error) {
    console.error('❌ Ошибка Vision OCR:', error.message);
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error(`Vision OCR error: ${error.message}`);
  }
}

/**
 * Распознаёт текст на изображении и возвращает структурированный результат
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @returns {Promise<{text: string, confidence: number, blocks: Array}>}
 */
async function analyzeImage(imageBuffer, mimeType = 'JPEG') {
  const folderId = config.yandex.folderId;
  const apiKey = config.yandex.apiKey;

  const contentBase64 = imageBuffer.toString('base64');

  const payload = {
    mimeType: mimeType,
    languageCodes: ['*'],
    content: contentBase64,
  };

  console.log(`🖼️ Анализируем изображение...`);

  try {
    const response = await axios.post(
      VISION_URL,
      payload,
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const lines = response.data.split('\n').filter(line => line.trim());
    let fullText = '';
    let blocks = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const textDetection = obj?.result?.textDetection || {};
        blocks = textDetection.blocks || [];
        for (const block of blocks) {
          for (const word of block.words || []) {
            if (word.text) {
              fullText += word.text + ' ';
            }
          }
        }
      } catch (e) {}
    }

    return {
      text: fullText.trim() || 'Текст не обнаружен',
      confidence: 0.8, // Vision OCR не возвращает точную уверенность
      blocks: blocks,
    };

  } catch (error) {
    console.error('❌ Ошибка анализа изображения:', error.message);
    throw error;
  }
}

module.exports = {
  recognizeImage,
  analyzeImage,
};
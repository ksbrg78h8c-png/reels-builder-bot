const AWS = require('aws-sdk');
const config = require('./config');

const BUCKET = process.env.STT_BUCKET || 'ai-studio-4f9d27-stt';
const ENDPOINT = process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net';

// Настройка S3-клиента для Yandex Object Storage
const s3 = new AWS.S3({
  endpoint: ENDPOINT,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'ru-central1',
  signatureVersion: 'v4',
});

/**
 * Загружает аудио в Object Storage бакет
 * @param {Buffer} audioBuffer - буфер с аудио
 * @param {string} key - путь/имя файла в бакете
 * @returns {Promise<string>} - URI файла
 */
async function uploadAudio(audioBuffer, key) {
  console.log(`📤 Загружаем аудио в бакет: ${BUCKET}/${key}...`);

  try {
    await s3.putObject({
      Bucket: BUCKET,
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/wav',
    }).promise();

    const uri = `https://storage.yandexcloud.net/${BUCKET}/${key}`;
    console.log(`✅ Аудио загружено: ${uri}`);
    return uri;

  } catch (error) {
    console.error('❌ Ошибка загрузки в S3:', error.message);
    throw new Error(`S3 upload error: ${error.message}`);
  }
}

/**
 * Генерирует уникальный ключ для файла
 * @param {string} prefix - префикс (video/, voice/, etc.)
 * @param {string} extension - расширение файла
 * @returns {string} - уникальный ключ
 */
function generateKey(prefix = 'audio/', extension = 'wav') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}-${random}.${extension}`;
}

/**
 * Проверяет существование бакета
 * @returns {Promise<boolean>} - существует ли бакет
 */
async function checkBucket() {
  try {
    await s3.headBucket({ Bucket: BUCKET }).promise();
    console.log(`✅ Бакет ${BUCKET} доступен`);
    return true;
  } catch (error) {
    console.error(`❌ Бакет ${BUCKET} не найден:`, error.message);
    return false;
  }
}

module.exports = {
  uploadAudio,
  generateKey,
  checkBucket,
  s3,
  BUCKET,
};
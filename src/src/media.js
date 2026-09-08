const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { recognizeAudio } = require('./speech');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Извлекает звук из видео в OGG/OPUS формат
 * @param {Buffer} videoBuffer - буфер с видео
 * @returns {Promise<Buffer>} - буфер с аудио
 */
async function extractAudioFromVideo(videoBuffer) {
  const tempVideoPath = path.join('/tmp', `video_${Date.now()}.mp4`);
  const tempAudioPath = path.join('/tmp', `audio_${Date.now()}.ogg`);

  fs.writeFileSync(tempVideoPath, videoBuffer);

  return new Promise((resolve, reject) => {
    ffmpeg(tempVideoPath)
      .toFormat('ogg')
      .audioCodec('libopus')
      .on('end', () => {
        try {
          const audioBuffer = fs.readFileSync(tempAudioPath);
          fs.unlinkSync(tempVideoPath);
          fs.unlinkSync(tempAudioPath);
          resolve(audioBuffer);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        try {
          fs.unlinkSync(tempVideoPath);
          if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        } catch (_) {}
        reject(err);
      })
      .save(tempAudioPath);
  });
}

/**
 * Обрабатывает видео: извлекает звук и распознаёт речь
 * @param {Buffer} videoBuffer - буфер с видео
 * @returns {Promise<string>} - распознанный текст
 */
async function processVideo(videoBuffer) {
  try {
    console.log('🎬 Обрабатываем видео...');
    const audioBuffer = await extractAudioFromVideo(videoBuffer);
    console.log('✅ Аудио извлечено, распознаём речь...');
    const text = await recognizeAudio(audioBuffer);
    return text;
  } catch (error) {
    console.error('❌ Ошибка обработки видео:', error.message);
    return 'Не удалось распознать звук из видео.';
  }
}

module.exports = {
  extractAudioFromVideo,
  processVideo,
};
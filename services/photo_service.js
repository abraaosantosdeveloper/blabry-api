const cloudinary = require('../config/cloudinary');
const pool = require('../database');
const UsersRepository = require('../repositories/users_repository');

const usersRepository = new UsersRepository(pool);

const fail = (message, status) =>
  Object.assign(new Error(message), { status });

const FOLDER = process.env.CLOUDINARY_FOLDER || 'blabry/perfis';

/**
 * Envia um buffer ao Cloudinary.
 * O upload_stream é baseado em callback: é preciso envolvê-lo em uma Promise
 * e escrever o buffer no stream, senão nada é transmitido.
 */
function uploadImage(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );

    stream.end(buffer);   // sem esta linha, a Promise nunca resolve
  });
}

/** Substitui a foto de perfil do usuário autenticado. */
async function updateProfilePhoto(userId, file) {
  if (!file?.buffer) throw fail('Nenhuma imagem enviada', 400);

  let result;
  try {
    result = await uploadImage(file.buffer, userId);
  } catch {
    throw fail('Não foi possível processar a imagem', 502);
  }

  const rows = await usersRepository.updatePhoto(userId, result.secure_url);
  if (!rows) throw fail('Usuário não encontrado', 404);

  return { photoUrl: result.secure_url };
}

module.exports = { updateProfilePhoto };
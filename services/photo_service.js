const cloudinary = require('../config/cloudinary');
const pool = require('../database');
const UsuariosRepository = require('../repositories/users_repository');

const usuariosRepository = new UsuariosRepository(pool);

const erro = (mensagem, status) =>
  Object.assign(new Error(mensagem), { status });

const PASTA = process.env.CLOUDINARY_FOLDER || 'blabry/perfis';

/**
 * Envia um buffer ao Cloudinary.
 * O upload_stream é baseado em callback: é preciso envolvê-lo em uma Promise
 * e escrever o buffer no stream, senão nada é transmitido.
 */
function enviarImagem(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PASTA,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (err, resultado) => (err ? reject(err) : resolve(resultado))
    );

    stream.end(buffer);   // sem esta linha, a Promise nunca resolve
  });
}

/** Substitui a foto de perfil do usuário autenticado. */
async function atualizarFotoDePerfil(usuarioId, arquivo) {
  if (!arquivo?.buffer) throw erro('Nenhuma imagem enviada', 400);

  let resultado;
  try {
    resultado = await enviarImagem(arquivo.buffer, usuarioId);
  } catch {
    throw erro('Não foi possível processar a imagem', 502);
  }

  const linhas = await usuariosRepository.atualizarFoto(usuarioId, resultado.secure_url);
  if (!linhas) throw erro('Usuário não encontrado', 404);

  return { fotoUrl: resultado.secure_url };
}

module.exports = { atualizarFotoDePerfil };
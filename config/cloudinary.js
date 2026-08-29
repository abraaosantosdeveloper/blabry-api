const { v2: cloudinary } = require('cloudinary')

const OBRIGATORIAS = ['CLOUDINARY_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const ausentes = OBRIGATORIAS.filter((nome) => !process.env[nome]);

if (ausentes.length) {
  throw new Error(
    `Configuração do Cloudinary incompleta. Variáveis ausentes: ${ausentes.join(', ')}`
  );
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
})

module.exports = cloudinary
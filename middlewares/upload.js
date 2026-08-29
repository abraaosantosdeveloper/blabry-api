const multer = require('multer')

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ['image/jpg', 'image/png', 'image/webp']

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: TAMANHO_MAXIMO,
        files: 1,
    },
    fileFilter(req, file, cb){
        if(!TIPOS_PERMITIDOS.includes(file.mimetype)) {
            return cb(Object.assign(
                new Error('Formato não suportado; Envie JPEG, PNG ou Webp'),
                {status: 415}
            ));
        }
        cb(null, true)
    },
})

function uploadUnico(campo){
    const middleware = upload.single(campo)

    return (req, res, next) => {
        middleware(req, res, (err) => {
            if(!err) return next();

            if (err instanceof multer.MulterError){
                const MAPA = {
                    LIMIT_FILE_SIZE: [413, 'Imagem muito grande. O limite é de 5Mb.'],
                    LIMIT_FILE_COUNT: [400, 'Envie apenas um arquivo'],
                    LIMIT_UNEXPECTED_FILE: [400, `Campo de arquivo inesperado. Use "${campo}".`],
                };
                const [status, mensagem] = MAPA[err.code] ?? [400, 'Falha no envio do arquivo'];
                return next(Object.assign(new Error(mensagem), { status }));
            }

            next(err);
        });
    }
}

module.exports = uploadUnico;
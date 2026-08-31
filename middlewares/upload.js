const multer = require('multer')

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_SIZE,
        files: 1,
    },
    fileFilter(req, file, cb){
        if(!ALLOWED_TYPES.includes(file.mimetype)) {
            return cb(Object.assign(
                new Error('Formato não suportado; Envie JPEG, PNG ou Webp'),
                {status: 415}
            ));
        }
        cb(null, true)
    },
})

function singleUpload(field){
    const middleware = upload.single(field)

    return (req, res, next) => {
        middleware(req, res, (err) => {
            if(!err) return next();

            if (err instanceof multer.MulterError){
                const MAPA = {
                    LIMIT_FILE_SIZE: [413, 'Imagem muito grande. O limite é de 5Mb.'],
                    LIMIT_FILE_COUNT: [400, 'Envie apenas um arquivo'],
                    LIMIT_UNEXPECTED_FILE: [400, `Campo de arquivo inesperado. Use "${field}".`],
                };
                const [status, mensagem] = MAPA[err.code] ?? [400, 'Falha no envio do arquivo'];
                return next(Object.assign(new Error(mensagem), { status }));
            }

            next(err);
        });
    }
}

module.exports = singleUpload;
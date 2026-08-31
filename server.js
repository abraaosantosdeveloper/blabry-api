require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Log de requisições
app.use((req, res, next) => {
    res.on('finish', () => {
        const timestamp = new Date().toLocaleString();
        const method = req.method;
        const url = req.originalUrl;
        const status = res.statusCode;
        console.log(`${timestamp} - "${url}" - ${status} - ${method}`);
    })
    next();
});

app.use(cors({
  origin: [process.env.FRONTEND_URL],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json());
app.use(express.static('public'));


// Documentação da API (Swagger UI)
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Blabry API',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/docs.json', (req, res) => res.json(swaggerSpec));

// Rotas públicas
app.use('/auth', require('./routes/auth_routes'));
app.use('/countries', require('./routes/countries_routes'));

// Middleware de autenticação JWT
const autenticar = require('./middlewares/autentication');
app.use(autenticar);
app.use('/users', require('./routes/usuarios_routes'));
app.use('/posts', require('./routes/post_routes'));

// Middleware de erro
app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Erros 4xx são comportamento esperado — o cliente errou, não o servidor.
  // Só falha real merece stack trace no log.
  if (status >= 500) console.error(err);

  const mensagem = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message;

  res.status(status).json({ erro: mensagem });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log("@@@@@@@@@@@@@@@ API ON-LINE @@@@@@@@@@@@@@@");
    });
}

module.exports = app;
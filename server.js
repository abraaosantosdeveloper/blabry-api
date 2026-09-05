require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { limiteGeral } = require('./middlewares/rate_limit');

const app = express();
const PORT = process.env.PORT || 3000;

/* O Railway coloca a aplicação atrás de um proxy, então o IP da conexão é o
   dele, não o do visitante. `trust proxy` faz o Express ler o IP real do
   cabeçalho X-Forwarded-For.

   Sem isso o limitador de requisições contaria todo mundo no mesmo balde, e
   o primeiro a estourar o limite trancaria os demais. O valor 1 significa
   "confie em um salto de proxy" — confiar em todos permitiria que o cliente
   forjasse o cabeçalho e escapasse do limite. */
app.set('trust proxy', 1);

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

/* Teto geral, antes de qualquer rota. Os limites específicos de
   autenticação e de envio de e-mail estão nas próprias rotas, porque
   dependem de números diferentes. */
app.use(limiteGeral);


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
const authenticate = require('./middlewares/authentication');
const authenticateSse = require('./middlewares/sse_authentication');
app.use('/pill-updates', authenticateSse, require('./routes/pill_update_routes'));
app.use(authenticate);
app.use('/users', require('./routes/users_routes'));
app.use('/posts', require('./routes/post_routes'));

// Middleware de erro
app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Erros 4xx são comportamento esperado — o cliente errou, não o servidor.
  // Só falha real merece stack trace no log.
  if (status >= 500) console.error(err);

  /* Só os 5xx são mascarados em produção.

     A versão anterior mascarava tudo, e o efeito era o oposto do pretendido:
     "É necessário aceitar a política de privacidade" chegava ao usuário como
     "Erro interno do servidor". A interface caía no texto genérico por
     status, e a pessoa não tinha como saber o que corrigir.

     A distinção é de origem, não de gravidade. Os 4xx são frases que nós
     escrevemos para o usuário ler; os 5xx carregam mensagem de exceção, que
     pode expor nome de tabela, caminho de arquivo ou trecho de consulta. */
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message;

  res.status(status).json({ error: message });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log("@@@@@@@@@@@@@@@ API ON-LINE @@@@@@@@@@@@@@@");
    });
}

module.exports = app;
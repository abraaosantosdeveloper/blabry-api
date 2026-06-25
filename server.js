require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Log de requisições
app.use((req, res, next) => {
    const start = Date.now();

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
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  methods: ['GET', 'POST'],
}));

app.use(express.json());
app.use(express.static('public'));


// Rotas públicas
app.use('/auth', require('./routes/auth_routes'));

// Middleware de autenticação JWT
const autenticar = require('./middlewares/autentication');
app.use(autenticar);

// Middleware de erro
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const mensagem = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message;
  res.status(status).json({ erro: mensagem });
});


app.listen(PORT, ()=>{

    /* API start */
    console.log("\n======================= API Information =======================\n");
    console.log(`\n\t🌐 API status: \t\t\t On-line!`);
    console.log(`\n\t🔗 Address: \t\t\t http://127.0.0.1:${PORT}`);
    console.log("\n===============================================================\n");

});
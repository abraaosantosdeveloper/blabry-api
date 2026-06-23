require('dotenv').config();
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24
    }
}))

// Rotas públicas
app.use('/auth', require('./routes/auth_routes'));

// Middleware de autenticação
app.use((req, res, next) => {
    if(!req.session?.userId){
        return res.status(401).json({ erro: "Não autorizado" })
    }
    next();
})

// Middleware de erro centralizado
app.use((err, req, res, next) => {
  console.error(err)
  const status = err.status || 500
  const mensagem = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message
  res.status(status).json({ erro: mensagem })
})


// Configuração básica...
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const timestamp = new Date().toLocaleString();
        const method = req.method;
        const url = req.originalUrl;
        const status = res.statusCode;

        // Exibe, no console, os códigos de estado das respostas
        console.log(`${timestamp} - "${url}" - ${status} - ${method}`);
    })
    next();
});

app.listen(PORT, ()=>{

    /* API start */
    console.log("\n======================= API Information =======================\n");
    console.log(`\n\t🌐 API status: \t\t\t On-line!`);
    console.log(`\n\t🔗 Address: \t\t\t http://127.0.0.1:${PORT}`);
    console.log("\n===============================================================\n");

});
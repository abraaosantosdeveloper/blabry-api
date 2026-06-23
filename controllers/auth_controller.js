const authService = require('../services/auth_service');

async function cadastrarUsuario(req, res, next){
    try {
        const { nome, apelido, email, senha } = req.body;
        const usuario = await authService.cadastrarUsuario({ nome, apelido, email, senha });
        res.status(201).json({ usuario });
    }
    catch(err) {
        next(err)
    }
}

async function login(req, res, next){
    try{
        const { email, senha } = req.body;
        const usuario = await authService.login({email, senha});

        req.session.userId = usuario.id;
        req.session.nome = usuario.nome;

        req.json({ usuario });
    }
    catch(err){
        next(err)
    }
}

async function logout(req, res, next) {
    try{
        req.session.destroy();
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    }
    catch(err){
        next(err)
    }
}

module.exports = { cadastrarUsuario, login, logout }
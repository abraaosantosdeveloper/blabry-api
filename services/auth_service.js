const bcrypt = require('bcrypt');
const authRepository = require('../repositories/auth_repository');

async function cadastrarUsuario({ nome, apelido, email, senha }){
    if(!nome || !apelido || !email || !senha)
        throw Object.assign(new Error('Campos obrigatórios ausentes'), { status: 400 });

    const existe = await authRepository.buscarPorEmail(email);
    if(existe)
        throw Object.assign(new Error("Credenciais inválidas!"), { status: 409 });

    const hash = await bcrypt.hash(senha, 12);
    const id = await authRepository.criarUsuario({ nome, apelido, email, senha: hash });
    return { id, nome, email };
}

async function login({ email, senha }){
    if(!email || !senha)
        throw Object.assign(new Error("Campos Obrigatórios ausentes!"), { status: 400 })

    const usuario = await authRepository.buscarPorEmail(email);
    const senhaValida = usuario && await bcrypt.compare(senha, usuario.senha);

    if(!usuario || !senhaValida)
        throw Object.assign(new Error("Credenciais Inválidas!"), { email: 401 });

    return {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email
    }
}

module.exports = { cadastrarUsuario, login }
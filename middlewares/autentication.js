const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token)
    return res.status(401).json({ erro: 'Não autorizado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.nomeUsuario = payload.nome;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

module.exports = autenticar;
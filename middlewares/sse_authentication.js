const jwt = require('jsonwebtoken');

/* EventSource não permite configurar o cabeçalho Authorization. O token é
   aceito na query apenas nesta rota de stream, que é a única que usa este
   middleware. */
function authenticateSse(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.access_token;

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.userName = payload.name;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = authenticateSse;
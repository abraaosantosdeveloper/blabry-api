const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token)
    return res.status(401).json({ error: 'Não autorizado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.userName = payload.name;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = authenticate;
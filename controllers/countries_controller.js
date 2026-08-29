const countriesService = require('../services/countries_service');

async function listarPaises(req, res, next) {
  try {
    const paises = await countriesService.listarPaises();
    res.status(200).json(paises);
  } catch (err) {
    next(err);
  }
}

module.exports = { listarPaises };

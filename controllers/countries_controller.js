const countriesService = require('../services/countries_service');

async function listAll(req, res, next) {
  try {
    const countries = await countriesService.listarPaises();
    res.status(200).json(countries);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAll };

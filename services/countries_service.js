const pool = require('../database');
const CountriesRepository = require('../repositories/countries_repository');

const countriesRepository = new CountriesRepository(pool);

async function listarPaises() {
  return countriesRepository.listarPaises();
}

module.exports = { listarPaises };

const pool = require('../database');
const CountriesRepository = require('../repositories/countries_repository');

const countriesRepository = new CountriesRepository(pool);

async function listAll() {
  return countriesRepository.listAll();
}

module.exports = { listAll };

const { seedBaseData } = require('../data/store');

async function ensureBaseSchema() {
  await seedBaseData();
}

module.exports = { ensureBaseSchema };

'use strict';

const { SQLiteConnection } = require('../../support/sqlite-connection');

async function createConnection() {
  const createTable = async (connection, Model, options) => {
    return await connection.createTable(Model, options);
  };

  let connection = new SQLiteConnection({
    emulateBigIntAutoIncrement: true,
    bindModels:                 false,
    models:                     require('../../support/models'),
  });

  await connection.start();

  let models  = connection.getModels();
  let keys    = Object.keys(models);

  for (let i = 0, il = keys.length; i < il; i++) {
    let key   = keys[i];
    let model = models[key];

    await createTable(connection, model);
  }

  return Object.assign({}, models, { connection });
}

async function truncateTables(connection) {
  let models  = connection.getModels();
  let keys    = Object.keys(models);

  for (let i = 0, il = keys.length; i < il; i++) {
    let key   = keys[i];
    let model = models[key];

    try {
      await await connection.truncate(model);
    } catch (error) {
      console.error('TRUNCATE TABLE FAILED: ', error);
      throw error;
    }
  }
}

module.exports = {
  createConnection,
  truncateTables,
};

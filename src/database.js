const Firebird = require('node-firebird');
const { loadConexao } = require('./config');

let db = null;
let connecting = null;

function attach() {
  const cfg = loadConexao();
  const options = {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    lowercase_keys: true,
  };

  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, connection) => {
      if (err) reject(err);
      else resolve(connection);
    });
  });
}

async function getDb() {
  if (db) return db;
  if (!connecting) {
    connecting = attach()
      .then((connection) => {
        db = connection;
        return db;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

function query(sql, params = []) {
  return new Promise(async (resolve, reject) => {
    try {
      const connection = await getDb();
      connection.query(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result || []);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function testConnection() {
  await query('SELECT 1 FROM RDB$DATABASE');
  const cfg = loadConexao();
  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
  };
}

function close() {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    db.detach(() => {
      db = null;
      resolve();
    });
  });
}

module.exports = { query, testConnection, close };

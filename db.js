'use strict';

const logger = require('heroku-logger')
const Sequelize = require('sequelize');

function sequelizeLog(message) {
  logger.info(message);
}

let sequelize = null;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(
    process.env.DATABASE_URL,
    {dialectOptions: {ssl: true}, logging: sequelizeLog},
  );
} else {
  sequelize = new Sequelize(
    process.env.DB,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      dialect: 'sqlite',
      logging: sequelizeLog,
    }
  );
}

const tables = [
  sequelize.define('user', {
    username: {
      type: Sequelize.STRING,
      validate: {
        notEmpty: true,
      },
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: Sequelize.STRING,
      validate: {
        notEmpty: true,
      },
      allowNull: false,
    },
  }),
];

let force = process.env.DROP_TABLES && process.env.DROP_TABLES.toLowerCase() === 'true';

Promise.all(tables.map(table => table.sync({force})))
  .then(() => logger.info('Table sync complete.'));

module.exports = sequelize;

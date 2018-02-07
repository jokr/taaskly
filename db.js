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

const User = sequelize.define('user', {
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
});

const Document = sequelize.define('document', {
  'name': {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  'content': {
    type: Sequelize.BLOB,
    allowNull: false,
  },
  'privacy': {
    type: Sequelize.ENUM('public', 'restricted'),
    defaultValue: 'public',
    allowNull: false,
  },
});

const Community = sequelize.define('community', {
  id: {
    type: Sequelize.BIGINT,
    primaryKey: true,
  },
  name: {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  accessToken: {
    type: Sequelize.STRING(510),
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  }
});

const Callback = sequelize.define('callback', {
  headers: {
    type: Sequelize.JSON,
    allowNull: false,
  },
  body: {
    type: Sequelize.JSON,
    allowNull: false,
  }},
  {
    updatedAt: false,
  },
);

Document.belongsTo(User, { as: 'owner',  foreignKey: { allowNull: false }, onDelete: 'CASCADE' });
User.belongsTo(Community);

let force = process.env.DROP_TABLES && process.env.DROP_TABLES.toLowerCase() === 'true';

Promise.all([Community.sync({force}), Callback.sync({force})])
  .then(() => User.sync({force}))
  .then(() => Document.sync({force}))
  .then(() => logger.info('Table sync complete.'))
  .catch(err => logger.error(err));

module.exports = sequelize;

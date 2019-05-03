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
  workplaceID: {
    type: Sequelize.BIGINT,
    allowNull: true,
    unique: true,
  },
});

const Task = sequelize.define('task', {
  title: {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  completed: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  priority: {
    type: Sequelize.ENUM('high', 'medium', 'low'),
    allowNull: true,
  },
});

const Folder = sequelize.define('folder', {
  name: {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  privacy: {
    type: Sequelize.ENUM('public', 'restricted'),
    defaultValue: 'public',
    allowNull: false,
  },
});

const Document = sequelize.define('document', {
  name: {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  content: {
    type: Sequelize.BLOB,
    allowNull: false,
  },
  privacy: {
    type: Sequelize.ENUM('public', 'restricted'),
    defaultValue: 'public',
    allowNull: false,
  },
});

const Page = sequelize.define('page', {
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
  },
  communityId: {
    type: Sequelize.BIGINT,
    allowNull: false,
  },
  communityName: {
    type: Sequelize.STRING,
    validate: {
      notEmpty: true,
    },
    allowNull: false,
  },
  installId: {
    type: Sequelize.BIGINT,
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
  path: {
    type: Sequelize.STRING,
    allowNull: false,
  },
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

Folder.belongsTo(User, { as: 'owner', foreignKey: { allowNull: false }, onDelete: 'CASCADE' });
Folder.hasMany(Document, { as: 'documents', onDelete: 'CASCADE' });
Document.belongsTo(User, { as: 'owner',  foreignKey: { allowNull: false }, onDelete: 'CASCADE' });
Document.belongsTo(Folder, { as: 'folder', foreignKey: {allowNull: true }, onDelete: 'CASCADE' });
Task.belongsTo(User, { as: 'owner', foreignKey: { allowNull: false }, onDelete: 'CASCADE' });
User.belongsTo(Community, { as: 'community', foreignKey: { allowNull: true }, onDelete: 'SET NULL'});

let force = process.env.DROP_TABLES && process.env.DROP_TABLES.toLowerCase() === 'true';
let sync = process.env.SYNC_TABLES && process.env.SYNC_TABLES.toLowerCase() === 'true';

if (sync || force) {
  Promise.all([Community.sync({force}), Callback.sync({force}), Page.sync({force})])
    .then(() => User.sync({force}))
    .then(() => Folder.sync({force}))
    .then(() => Promise.all([Document.sync({force}), Task.sync({force})]))
    .then(() => logger.info('Table sync complete.'))
    .catch(err => logger.error(err));
}

module.exports = sequelize;

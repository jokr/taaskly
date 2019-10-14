'use strict';

const express = require('express');
const Op = require('sequelize').Op;
const logger = require('heroku-logger');

const BadRequest = require('./BadRequest');
const db = require('../../db');

const router = express.Router();

function extractId(link) {
  const regexMatch = link.match(/\/(document|task|folder)\/([0-9]+)/);
  if (regexMatch === null) {
    logger.warn('Received unknown link', link);
    throw new BadRequest('Unknown document link');
  }
  return {
    id: parseInt(regexMatch[2]),
    type: regexMatch[1],
  };
}

function readChange(body) {
    if (body.entry.length !== 1) {
      logger.warn(`expected exactly one entry, got ${body.entry.length}`);
      throw new BadRequest('Malformatted request.');
    }
    if (body.entry[0].changes.length !== 1) {
      logger.warn(`expected exactly one change, got ${body.entry.changes.length}`);
      throw new BadRequest('Malformatted request.');
    }
    return body.entry[0].changes[0];
}

function handlePostback(change) {
  const {id, type} = extractId(change.link);
  return db.models.community.findById(parseInt(change.community.id))
    .then(community => {
      if (community === null) {
        throw new BadRequest('Unknown community.');
      }
      logger.warn(change.user.id);
      return db.models.user.findOne({where: {workplaceID: change.user.id}});
    })
    .then(user => {
      logger.warn(user);
      switch (type) {
        case 'task':
          if (user) {
          return db.models.task
            .findById(id, {include: [{ model: db.models.user, as: 'owner' }]})
            .then(task => {
              if (task === null) {
                return {data: [], user};
              }
              if (change.payload == "Close.Task" && change.value = "Close") {
                task.completed = true;
              }
              const data = encodeTask(change.link)(task);
              return {data: [data], user};
            });
        } else {
          return {data: [], user};
        }
        break;
      default:
        throw new BadRequest('Invalid url.');
  }
}

function handlePreview(change) {
  const {id, type} = extractId(change.link);
  return db.models.community.findById(parseInt(change.community.id))
    .then(community => {
      if (community === null) {
        throw new BadRequest('Unknown community.');
      }
      logger.warn(change.user.id);
      return db.models.user.findOne({where: {workplaceID: change.user.id}});
    })
    .then(user => {
      logger.warn(user);
      switch (type) {
        case 'document':
          return db.models.document
            .findOne({
              where: {
                id: id,
                [Op.or]: {
                  privacy: 'public',
                  ownerId: user ? user.id : null,
                },
              },
            })
            .then(doc => {
              if (doc === null) {
                return {data: [], user};
              }
              return {
                data: [encodeDoc(change.link)(doc)],
                user,
              };
            });
          break;
        case 'folder':
          return db.models.folder
            .findOne({
              where: {
                id: id,
                [Op.or]: {
                  privacy: 'public',
                  ownerId: user ? user.id : null,
                },
              },
            })
            .then(folder => {
              if (folder === null) {
                return {data: [], user};
              }
              return {
                data: [encodeFolder(change.link)(folder)],
                user,
              };
            });
            break;
        case 'task':
          if (user) {
            return db.models.task
              .findById(id, {include: [{ model: db.models.user, as: 'owner' }]})
              .then(task => {
                if (task === null) {
                  return {data: [], user};
                }
                const data = encodeTask(change.link)(task);
                return {data: [data], user};
              });
          } else {
            return {data: [], user};
          }
          break;
        default:
          throw new BadRequest('Invalid url.');
      }
    });
}

function handleCollection(change) {
  return db.models.community
    .findById(parseInt(change.community.id))
    .then(community => {
      if (community === null) {
        throw new BadRequest('Unknown community.');
      }
      return db.models.user.findOne({where: {workplaceID: change.user.id}});
    })
    .then(user => {
      if (user === null) {
        return {data: [], user};
      }
      const filter = {
        order: [['createdAt', 'DESC']],
        where: {
          [Op.or]: {
            privacy: 'public',
            ownerId: user ? user.id : null,
          },
        },
        limit: 5,
      };
      if (change.link) {
        if (change.link.endsWith('personalized-tasks')) {
          return db.models.task
            .findAll({include: [{ model: db.models.user, as: 'owner' }]})
            .then(tasks => {
              const data = tasks.map(encodeTask());
              return {data, user};
            });
        }

        const {id, type} = extractId(change.link);
        filter.where['folderId'] = id;
        return db.models.document
          .findAll(filter)
          .then(documents => {
            const data = documents.map(encodeDoc());
            return {data, user};
          });
      }
      return Promise.all([
          db.models.document.findAll(filter),
          db.models.folder.findAll(filter),
        ])
        .then(results => {
          const [documents, folders] = results;
          const personalizedFolders = [
            {
              link: `${process.env.BASE_URL}personalized-tasks`,
              title: 'Tasks',
              privacy: 'personalized',
              type: 'folder',
            },
          ];
          const folderData = folders.map(encodeFolder());
          const documentData = documents.map(encodeDoc());
          return {
            data: personalizedFolders.concat(folderData, documentData),
            user: user,
          };
        });
    });
}

router.route('/callback')
  .post((req, res, next) => {
    if (req.body.object !== 'link') {
      logger.warn('Received invalid link webhook', req.body);
      throw new BadRequest('Invalid topic.');
    }

    const change = readChange(req.body);
    let handler = null;
    switch (change.field) {
      case 'preview':
        handler = handlePreview(change.value);
        break;
      case 'collection':
        handler = handleCollection(change.value);
        break;
      case 'postback':
        handler = handlePostback(change.value)
    }
    if (handler === null) {
      throw new BadRequest('No handler for change.');
    }
    handler
      .then(response => {
        res
          .status(200)
          .json({data: response.data, linked_user: response.user !== null});
      })
      .catch(next);
  });

module.exports = router;

function encodeDoc(link) {
  return function(doc) {
    return {
      link: link ? link : `${process.env.BASE_URL}document/${doc.id}`,
      title: doc.name,
      description: doc.content.toString().substring(0, 200),
      privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
      icon: `${process.env.BASE_URL}/taaskly.png`,
      download_url: `${process.env.BASE_URL}download/${doc.id}/`,
      canonical_link: `${process.env.BASE_URL}document/${doc.id}`,
      type: 'doc',
    };
  };
}

function encodeFolder(link) {
  return function(folder) {
    return {
      link: link ? link : `${process.env.BASE_URL}folder/${folder.id}`,
      title: folder.name,
      privacy: folder.privacy === 'public' ? 'organization' : 'accessible',
      canonical_link: `${process.env.BASE_URL}folder/${folder.id}`,
      type: 'folder',
    };
  };
}

function encodeTask(link) {
  return function(task) {
    const additionalData = [];
    if (task.owner.workplaceID) {
      additionalData.push(
        {
          title: 'Owner',
          format: 'user',
          value: task.owner.workplaceID,
        },
      );
    } else {
      additionalData.push(
        {
          title: 'Owner',
          format: 'text',
          value: task.owner.username,
        },
      );
    }

    additionalData.push(
      {
        title: 'Created',
        format: 'datetime',
        value: task.createdAt,
      },
    );

    if (task.priority !== null) {
      additionalData.push(
        {
          title: 'Priority',
          format: 'text',
          value: task.priority,
          color: task.priority === 'high'
            ? 'red'
            : task.priority === 'medium'
            ? 'orange'
            : 'yellow',
        },
      );
    }

    const actions = [
      {
        value: 'Close',
        color: 'red',
        payload: 'Close.Task',
        disabled: task.completed,
        type: 'postback_button'
      },
    ]

    return {
      link: link ? link : `${process.env.BASE_URL}/task/${task.id}`,
      title: task.title,
      privacy: 'organization',
      type: 'task',
      actions: actions,
      additional_data: additionalData,
      icon: `${process.env.BASE_URL}/taaskly.png`,
      canonical_link: `${process.env.BASE_URL}task/${task.id}`,
    };
  };
}

'use strict';

const express = require('express');
const Op = require('sequelize').Op;
const logger = require('heroku-logger');

const BadRequest = require('./BadRequest');
const db = require('../../db');

const router = express.Router();

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

function handlePreview(change) {
  const regexMatch = change.link.match(/\/(document|task)\/([0-9]+)/);
  if (regexMatch === null) {
    logger.warn('Received unknown link', change.link);
    throw new BadRequest('Unknown document link');
  }

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
      const id = parseInt(regexMatch[2]);
      switch (regexMatch[1]) {
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
                data: [encodeDoc(doc)],
                user,
              };
            });
          break;
        case 'task':
          return db.models.task
            .findById(id, {include: [{ model: db.models.user, as: 'owner' }]})
            .then(task => {
              if (task === null) {
                return {data: [], user};
              }
              const data = encodeTask(task);
              return {data: [data], user};
            });
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
      if (!change.link) {
        return db.models.document
          .findAll({
            where: {
              [Op.or]: {
                privacy: 'public',
                ownerId: user ? user.id : null,
              },
            },
            order: [['createdAt', 'DESC']],
            limit: 5,
          })
          .then(documents => {
            const data = documents.map(encodeDoc);
            data.push({
              link: `${process.env.BASE_URL}personalized-tasks`,
              title: 'Tasks',
              privacy: 'personalized',
              type: 'folder',
            });
            return {data, user};
          });
      }
      if (change.link.endsWith('personalized-tasks')) {
        return db.models.task
          .findAll({include: [{ model: db.models.user, as: 'owner' }]})
          .then(tasks => {
            const data = tasks.map(encodeTask);
            return {data, user};
          });
      }
      throw new BadRequest('Unknown link.');
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

function encodeDoc(doc) {
  return {
    link: `${process.env.BASE_URL}document/${doc.id}`,
    title: doc.name,
    description: doc.content.toString().substring(0, 200),
    privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
    icon: `${process.env.BASE_URL}taaskly-icon.png`,
    download_url: `${process.env.BASE_URL}download/${doc.id}/`,
    type: 'doc',
  };
}

function encodeTask(task) {
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
  return {
    link: `${process.env.BASE_URL}/task/${task.id}`,
    title: task.title,
    privacy: 'organization',
    type: 'task',
    additional_data: additionalData,
    icon: `${process.env.BASE_URL}taaskly-icon.png`,
  }
}

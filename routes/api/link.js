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
                data: [{
                  link: change.link,
                  title: doc.name,
                  description: doc.content.toString().substring(0, 200),
                  privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
                  icon: `${process.env.BASE_URL}taaskly-icon.png`,
                  canonical_link: `${process.env.BASE_URL}document/${doc.id}`,
                  download_url: `${process.env.BASE_URL}download/${doc.id}/`,
                  type: 'doc',
                }],
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
                      : 'blue',
                  },
                );
              }
              const data = {
                link: change.link,
                title: task.title,
                privacy: 'organization',
                type: 'task',
                additional_data: additionalData,
                icon: `${process.env.BASE_URL}taaskly-icon.png`,
              };
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
    .then(user => db.models.document
      .findAll({where: {
        [Op.or]: {
          privacy: 'public',
          ownerId: user ? user.id : null,
        },
      }})
      .then(documents => {
        const data = documents.map(doc => {
          return {
            link: `${process.env.BASE_URL}document/${doc.id}`,
            title: doc.name,
            description: doc.content.toString().substring(0, 200),
            privacy: doc.privacy === 'public' ? 'organization' : 'accessible',
            icon: `${process.env.BASE_URL}taaskly-icon.png`,
            download_url: `${process.env.BASE_URL}download/${doc.id}/`,
            type: 'doc',
          };
        });
        return {data, user};
      }),
    );
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

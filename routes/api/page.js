'use strict';

const express = require('express');
const Op = require('sequelize').Op;
const logger = require('heroku-logger');

const BadRequest = require('./BadRequest');
const db = require('../../db');
const graph = require('../../graph');

const router = express.Router();

router.route('/callback')
  .post((req, res, next) => {
    if (req.body.object !== 'page') {
      logger.warn('Received invalid page webhook', req.body);
      throw new BadRequest('Invalid topic.');
    }
    res.status(200).send();
    const mentionHandles = req.body.entry
      .map(entry => entry.changes)
      .reduce((acc, val) => acc.concat(val), [])
      .filter(change => change.field === 'mention')
      .map(change => change.value)
      .filter(value => value.verb === 'add')
      .map(handleMention);
    Promise
      .all(mentionHandles)
      .then(results => {
        console.log(results);
        logger.info('Posted back.')
      });
  });

function handleMention(value) {
  const communityId = parseInt(value.community.id);
  db.models.community.findById(communityId)
    .then(community => {
      if (community === null) {
        throw new BadRequest(`Could not find community for mention webhook: ${communityId}`);
      }

      if (value.item === 'comment') {
        return graph(value.comment_id)
          .token(community.accessToken)
          .qs({fields: 'parent{id}'})
          .send()
          .then(response => {
            if (response.parent) {
              return replyRequest(response.parent.id)
                .token(community.accessToken)
                .send();
            } else {
              return replyRequest(value.comment_id)
                .token(community.accessToken)
                .send();
            }
          });
      }

      return replyRequest(value.post_id)
        .token(community.accessToken)
        .send();
    })
    .catch(err => {
      logger.error(err.message);
    })
}

function replyRequest(target) {
  return graph(`${target}/comments`)
    .post()
    .body({message: 'Yo, this is Taaskly'});
}

module.exports = router;

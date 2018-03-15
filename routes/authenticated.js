'use strict';

const express = require('express');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;

const db = require('../db');
const graph = require('../graph');
const messages = require('../messages');

const router = express.Router();

router.route('/logout')
  .get((req, res, next) => {
    req.logout();
    res.redirect('/');
  });

router.route('/documents')
  .get((req, res, next) => db.models.document
    .findAll({
      where: {
        [Op.or]: [{ownerId: req.user.id}, {privacy: 'public'}],
      },
      order: [['updatedAt', 'DESC']]
    })
    .then(documents => res.render('documents', {documents}))
    .catch(next),
  );

router.route('/document/create')
  .get((req, res, next) => res.render('createDocument'))
  .post((req, res, next) => db.models.document
    .create({
      name: req.body.name,
      content: req.body.content,
      privacy: req.body.privacy,
      ownerId: req.user.id,
      icon: req.body.unicorn ? 'unicorn.png' : null,
    })
    .then(() => res.redirect('/documents'))
    .catch(next),
  );

router.route('/document/:id')
  .get((req, res, next) => db.models.document
    .findById(req.params.id, {include: [{model: db.models.user, as: 'owner'}]})
    .then(document => {
      if (!document) {
        return res
          .status(404)
          .render(
            'error',
            {
              header: 'Document does not exist',
              message: 'The document you requested does not seem to exist.',
            },
          );
      }
      if (document.privacy === 'restricted' && req.user.id !== document.owner.id) {
        return res
          .status(403)
          .render(
            'error',
            {
              header: 'Document is private',
              message: 'This document is private.',
            },
          );
      }
      return res.render('document', {document});
    })
    .catch(next),
  );

router.route('/tasks')
  .get((req, res, next) => db.models.task
    .findAll({ include: [{ model: db.models.user, as: 'owner' }]})
    .then(tasks => res.render('tasks', {tasks}))
    .catch(next),
  );

router.route('/task/create')
  .get((req, res, next) => res.render('createTask'))
  .post((req, res, next) => db.models.task
    .create({
      title: req.body.title,
      priority: req.body.priority,
      ownerId: req.user.id,
    })
    .then(() => res.redirect('/tasks'))
    .catch(next)
  );

router.route('/task/:id')
  .get((req, res, next) => db.models.task
    .findById(req.params.id, {include: [{ model: db.models.user, as: 'owner' }]})
    .then(task => res.render('task', {task})),
  );

router.route('/messages')
  .get((req, res, next) => res.render('messages'))
  .post((req, res, next) => {
      messages.postTextMessage(req.body.target, req.body.message, null)
      .then(() => res.redirect('/messages'))
      .catch(next);
    },
  );

router.route('/link_account_confirm')
  .get((req, res ,next) => {
    const signedRequest = req.session.signedRequest;
    if (!signedRequest) {
      return res
        .status(400)
        .render('error', {message: 'No saved signed request.'});
    }
    Promise.all([
      db.models.community.findById(signedRequest.community_id),
      db.models.user.findOne({where: {workplaceID: signedRequest.user_id}}),
    ])
    .then(results => {
      const [community, user] = results;
      if (!community) {
        return res
          .status(400)
          .render(
            'error',
            {message: `No community with id ${signedRequest.community_id} found`},
          );
      }
      if (user && user.id !== req.user.id) {
        return res
          .status(400)
          .render(
            'error',
            {message: `This user is already linked to somebody else.`},
          );
      }
      return res.render('linkAccount', {community, signedRequest});
    })
    .catch(next);
  })
  .post((req, res, next) => {
    const signedRequest = req.session.signedRequest;
    Promise.all([
      db.models.community.findById(signedRequest.community_id),
      db.models.user.findOne({where: {workplaceID: signedRequest.user_id}}),
    ]).then(results => {
      const [community, user] = results;
      const redirect = signedRequest.redirect;
      delete req.session.signedRequest;
      return req.user
        .update({
          workplaceID: signedRequest.user_id,
          communityId: community.id,
        })
        .then(user => res.render('linkSuccess', {redirect}));
    })
    .catch(next);
  });

module.exports = router;

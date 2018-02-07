'use strict';

const express = require('express');
const logger = require('heroku-logger');

const db = require('../db');

const router = express.Router();

router.route('/logout')
  .get((req, res, next) => {
    req.logout();
    res.redirect('/');
  });

router.route('/users')
  .get((req, res, next) => db.models.user
    .findAll({order: [['createdAt', 'DESC']]})
    .then(users => res.render('users', {users})),
  );

router.route('/documents')
  .get((req, res, next) => db.models.document
    .findAll({order: [['updatedAt', 'DESC']]})
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
    })
    .then(() => res.redirect('/documents'))
    .catch(next),
  );

router.route('/document/:id')
  .get((req, res, next) => db.models.document
    .findById(req.params.id, {include: [{model: db.models.user, as: 'owner'}]})
    .then(document => res.render('document', {document}))
    .catch(next),
  );

module.exports = router;

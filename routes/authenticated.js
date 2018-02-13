'use strict';

const express = require('express');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;

const db = require('../db');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Documents', path: '/documents'},
  ];
  next();
});

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

module.exports = router;

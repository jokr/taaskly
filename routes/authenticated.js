'use strict';

const express = require('express');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;

const db = require.main.require('./db');
const graph = require.main.require('./graph');

const router = express.Router();

router.use((req, res, next) => {
  const navigation = [
    {name: 'Documents', path: '/documents'},
    {name: 'Folders', path: '/folders'},
    {name: 'Tasks', path: '/tasks'},
  ];
  if (req.isAdmin) {
    navigation.push({name: 'Admin', path: '/admin'});
  }
  res.locals.navigation = navigation;
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
      include: [
        {model: db.models.user, as: 'owner'},
        {model: db.models.folder, as: 'folder'},
      ],
      where: {
        [Op.or]: [{ownerId: req.user.id}, {privacy: 'public'}],
      },
      order: [['updatedAt', 'DESC']]
    })
    .then(documents => res.render('documents', {documents}))
    .catch(next),
  );

router.route('/document/create')
  .get((req, res, next) =>
    db.models.folder
      .findAll()
      .then(folders => res.render('createDocument', {folders, selected: req.query.folder}))
  )
  .post((req, res, next) => db.models.document
    .create({
      name: req.body.name,
      content: req.body.content,
      privacy: req.body.privacy,
      ownerId: req.user.id,
      folderId: req.body.folder ? req.body.folder : null,
    })
    .then(() => res.redirect('/documents'))
    .catch(next),
  );

router.route('/document/:id')
  .get((req, res, next) => Promise.all([
    db.models.document.findById(
      req.params.id, {
        include: [{model: db.models.user, as: 'owner'}],
        where: {
          [Op.or]: {
            privacy: 'public',
            ownerId: req.user.id,
          },
        },
      },
    ),
    req.user.community === null
      ? Promise.resolve(null)
      : graph('')
          .token(req.user.community.accessToken)
          .qs({
            id: `${process.env.BASE_URL}document/${req.params.id}`,
            fields: 'id,sharedposts{id,story,message,privacy,created_time,permalink_url,from{id,name,link,picture},target{id}}',
          })
          .send(),
  ])
  .catch(next)
  .then(result => {
    const [document, graphResponse] = result;
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
    return res.render('document', {document, sharedposts: graphResponse ? graphResponse.sharedposts : null});
  }));

router.route('/folders')
  .get((req, res, next) => db.models.folder
    .findAll({ include: [{model: db.models.user, as: 'owner'}]})
    .then(folders => res.render('folders', {folders}))
    .catch(next),
  );

router.route('/folder/create')
  .get((req, res, next) => res.render('createFolder'))
  .post((req, res, next) => db.models.folder
    .create({
      name: req.body.name,
      privacy: req.body.privacy,
      ownerId: req.user.id,
    })
    .then(() => res.redirect('/folders'))
    .catch(next));

router.route('/folder/:id')
  .get((req, res, next) => db.models.folder.findById(
    req.params.id, {
      include: [
        {model: db.models.user, as: 'owner'},
        {model: db.models.document, as: 'documents'},
      ],
      where: {
        [Op.or]: {
          privacy: 'public',
          ownerId: req.user.id,
        },
      },
    })
    .then(folder => {
      if (!folder) {
        return res
          .status(404)
          .render(
            'error',
            {
              header: 'Folder does not exist',
              message: 'The folder you requested does not seem to exist.',
            },
          );
      }
      return res.render('folder', {folder});
    })
    .catch(next)
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

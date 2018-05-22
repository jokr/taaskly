# taaskly

A Workplace application demonstrating account linking, file preview and composer integration. This models a simple document store with very simple privacy rules.

![image](https://user-images.githubusercontent.com/231923/40370723-c926c2e6-5dd8-11e8-9b0a-d35ab490240d.png)

## Running Locally

Make sure you have [Node.js](http://nodejs.org/) installed.

```sh
$ git clone git@github.com:jokr/taaskly.git
$ cd taaskly
$ touch .env
```

Open the `.env` file and enter the credential details of your app in the following
form:

```
APP_ID=YOUR_APP_ID
APP_SECRET=YOUR_APP_SECRET
APP_REDIRECT=YOUR_APP_REDIRECT
```

We also need a couple of other configuration variables:

```
SESSION_SECRET=SOME_RANDOM_BYTES
DATABASE_URL=DB_CONNECTION_STRING
BASE_URL=URL_WHERE_THIS_APP_IS_RUNNING
```

Then start the application.

```sh
$ npm install
$ npm start
```

Your app should now be running on [localhost:5000](http://localhost:5000/).

## Deploying to Heroku

Make sure you have the [Heroku CLI](https://cli.heroku.com/) installed.

```
$ heroku create
$ heroku config:set APP_ID=YOUR_APP_ID
$ heroku config:set APP_SECRET=YOUR_APP_SECRET
$ heroku config:set APP_REDIRECT=YOUR_APP_REDIRECT
$ heroku config:set SESSION_SECRET=SOME_RANDOM_BYTES
$ heroku config:set DATABASE_URL=DB_CONNECTION_STRING
$ heroku config:set BASE_URL=BASE_URL
$ git push heroku master
$ heroku open
```
or

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/jokr/taaskly)

## Documentation

- [Graph API Overview](https://developers.facebook.com/docs/graph-api/overview)
- [Workplace Docs](https://developers.facebook.com/docs/workplace)

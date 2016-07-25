/*
This file implements a Node Express service.  It connects our business logic
to Node Express.  If you don't care about Node Express, you can ignore this
file.
See wordpress.js for business logic- the real implementation of the integration.
*/

const wordpress = require('./wordpress');

const config = require('./config');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));


// Helper functions

/**
 * Extracts the return_url from a POST request.  The return_url is the URL
 * to which this integration should post updated metadata, state, etc.
 *
 * @param {req} req POST request
 * @returns {string}
 */
function returnUrl(req) {
  return req.body.return_url;
}

/**
 * Extracts the starting name from a POST request.  This is the name of the
 * account, which is displayed in the Zendesk admin UI.
 *
 * @param {req} req POST request
 * @returns {string}
 */
function name(req) {
  return req.body.name;
}

/**
 * Extracts the metadata from a POST request.  The metadata contains the
 * information needed to connect to Wordpress.  If the request doesn't
 * include metadata, default information is returned.
 *
 * @param {req} req POST request
 * @returns {Object} Containing login, password, wordpress_location, author
 */
function metadata(req) {
  if (req.body.metadata) {
    return JSON.parse(req.body.metadata);
  }

  return {
    login: '',
    password: '',
    wordpress_location: '',
    author: null
  };
}

/**
 * Extracts the state from a POST request.  The state contains the
 * state of pull requests, specifically, the datetime of the most recently
 * pulled Comment.  If the request doesn't include state, an empty object is
 * returned.
 *
 * @param {req} req POST request
 * @returns {Object}
 */
function state(req) {
  if (req.body.state) {
    return JSON.parse(req.body.state);
  }

  return {};
}

/**
 * Extracts the parent_id from a channelback POST request.  The parent_id is the
 * ID of the item that the agent is responding to.
 *
 * @param {req} req Channelback POST request
 * @returns {string}
 */
function parentId(req) {
  return req.body.parent_id;
}

/**
 * Extracts the message from a channelback POST request.  The message is the
 * text content of the Comment that the agent added to Zendesk, and wishes
 * to be represented as a Wordpress comment.
 *
 * @param {req} req POST request
 * @returns {string}
 */
function channelbackMessage(req) {
  return req.body.message;
}

/**
 * Extracts the external_id from a clickthrough GET request.  This is the
 * ID of the item they're clicking through on.
 *
 * @param {req} req GET request
 * @returns {string}
 */
function clickthroughId(req) {
  return req.query.external_id;
}


// Routes

app.get('/manifest', (req, res) => {
  wordpress.manifest(res);
});

app.post('/admin_ui', (req, res) => {
  wordpress.admin_ui(returnUrl(req), name(req), metadata(req), res);
});

app.post('/admin_ui_2', (req, res) => {
  wordpress.admin_ui_2(req.body, res);
});

app.post('/pull', (req, res) => {
  wordpress.pull(metadata(req), state(req), res);
});

app.post('/channelback', (req, res) => {
  wordpress.channelback(
    metadata(req), parentId(req),
    channelbackMessage(req), res);
});

app.get('/clickthrough', (req, res) => {
  wordpress.clickthrough(clickthroughId(req), res);
});

app.get('/healthcheck', (req, res) => {
  wordpress.healthcheck(res);
});


// Startup

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);  // eslint-disable-line no-console
});


// Test endpoints and functions

/**
 * Helper method to calculate the HTML response body for test requests
 *
 * @param {string} escapedMetadata The metadata to include in POSTs, escaped for
 * inclusion in HTML
 * @returns {string}
 */
function startContent(escapedMetadata) {
  return `<html><body>
      <form method="post" action = "./admin_ui">
        <input type="hidden" name="metadata" value="${escapedMetadata}">
        </input>
        <input type="hidden" name="state" value="{}"></input>
        <input type="hidden" name="name" value="Wordpress"></input>
        <input type="hidden" name="subdomain" value="support"></input>
        <input type="hidden" name="locale" value="EN-us"></input>
        <input type="hidden" name="return_url" value="./end_ui"></input>
        <input type="submit">
      </form>
    </body></html>`;
}

app.get('/start_ui', (req, res) => {
  res.send(startContent(''));
});

app.get('/restart_ui', (req, res) => {
  const initialValue = JSON.stringify({
    name: 'Wordpress',
    login: 'admin',
    password: '123456',
    wordpress_location: 'http://WORDPRESS_HOST/'
  }).replace(/"/g, '&quot;');

  res.send(startContent(initialValue));
});

app.post('/end_ui', (req, res) => {
  res.send(req.body);
});

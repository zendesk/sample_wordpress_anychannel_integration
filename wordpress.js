/*
This file comprises the "business logic" for the Wordpress integration.  It
implements the relevant endpoints, such as pull, channelback, etc., as well
as related helper functions.
*/
'use strict';  // eslint-disable-line strict

const request = require('request');
const htmlparser = require('htmlparser2');

/**
 * Escapes a string for inclusion in an HTML form input.
 *
 * @param {string} input String to be escaped
 * @returns {string} Escaped string
 */
function escapeString(input) {
  return input.replace(/"/g, '&quot;');
}

/**
 * Calculates the HTML for an admin UI page
 *
 * @param {string} name The name of the integration instance
 * @param {string} login HTTP Basic Auth login to Wordpress service
 * @param {string} password HTTP Basic Auth password to Wordpress service
 * @param {string} location URL to the Wordpress service
 * @param {string} returnUrl Zendesk URL to which metadata and state should be
 * posted
 * @param {string} warning Warning string to be displayed to user, e.g. when
 * redisplaying page after encountering errors.  May contain HTML, may be null.
 * @returns {string} HTML
 */
function adminUiHtml(name, login, password, location, returnUrl, warning) {
  let warningStr = '';

  if (warning) {
    warningStr = `${warning}<br>`;
  }

  return `<html><body>
      <form method="post" action = "./admin_ui_2">
        Name: <input type="text" name="name" value="${escapeString(name)}"><br>
        Login:
          <input type="text" name="login" value="${escapeString(login)}"><br>
        Password:
          <input type="password"
                 name="password"
                 value="${escapeString(password)}"><br>
        Wordpress location (URL):
          <input type="text"
                 name="wordpress_location"
                 value="${escapeString(location)}"><br>
        <input type="hidden"
               name="return_url"
               value="${escapeString(returnUrl)}"></input>
        ${warningStr}
        <input type="submit">
      </form>
    </body></html>`;
}

/**
 * Calculates the "external id" for a Wordpress comment which will be stored in
 * Zendesk.  This includes the ID of the comment, the ID of the post which
 * contains the comment, and the link to see the comment in the Wordpress UI.
 *
 * @param {string} link The link to the comment, or to any other comment in the
 * post
 * @param {Number} id The ID of the comment
 * @param {Number} postId The ID of the post which contains the comment
 * @returns {string} ID
 */
function externalCommentId(link, id, postId) {
  // Unfortunately, the link might not be a link to the particular comment we
  // care about- it might be to another comment on the same post.  To handle
  // this, we'll replace the ID in the link with the ID of this comment.
  const fixedLink = link.replace(/\d+$/, id.toString());

  return `${postId}:${id}:${fixedLink}`;
}

/**
 * Reverses the action of externalCommentId: parses the post ID, comment ID, and
 * link out of an external ID that was created by externalCommentId
 *
 * @param {string} externalCommentIdString The external comment ID
 * @returns {Object} Object containing post_id, comment_id, and link
 */
function parseExternalCommentId(externalCommentIdString) {
  const match = /(\d+):(\d+):(.*)/.exec(externalCommentIdString);

  return {
    post_id: match[1],
    comment_id: match[2],
    link: match[3]
  };
}

/**
 * Returns the manifest for this integration as JSON.  It can be tested like:
 *  curl http://localhost:3000/manifest
 *
 * @param {Object} res Response object to which JSON will be written
 */
exports.manifest = res => {
  res.send({
    name: 'Wordpress',
    id: 'com.zendesk.anychannel.integrations.wordpress',
    author: 'Zendesk',
    version: 'v0.0.1',
    channelback_files: true,
    urls: {
      admin_ui: './admin_ui',
      pull_url: './pull',
      channelback_url: './channelback',
      clickthrough_url: './clickthrough',
      healthcheck_url: './healthcheck',
      event_callback_url: './event_callback'
    }
  });
};

/**
 * Returns the HTML for the administrative UI for setting up or editing
 * metadata for the Wordpress integration.  It displays a form allowing the
 * administrator to set the login and password for Wordpress, as well as the
 * URL to the Wordpress instance.
 * When the administrator submits the form, the information will be POSTed to
 * admin_ui_2, which is responsible for validating and formatting the
 * information.
 *
 * It can be tested like:
 *  curl -d "return_url=http://localhost:3000/end_ui&name=Test name&metadata={\"password\":\"123456\", \"login\":\"admin\", \"wordpress_location\":\"http://WORDPRESS_HOST/\"}" http://localhost:3000/admin_ui
 *
 * @param {string} returnUrl URL in Zendesk to which updated metadata should be
 *  POSTed
 * @param {string} name Initial name of account, to be edited by
 *  Administrator.  May be blank.
 * @param {Object} metadata Initial value of metadata, which contains login,
 *  password, and wordpress_location.  Items may be blank.
 * @param {Object} res Response object to which HTML will be written
 */
exports.admin_ui = (returnUrl, name, metadata, res) => {
  const html = adminUiHtml(
    name,
    metadata.login,
    metadata.password,
    metadata.wordpress_location,
    returnUrl);

  res.send(html);
};

/**
 * Calculates the request options to be used when requesting user information
 * from the Wordpress API
 *
 * @param {Object} uiOptions Object containing wordpress_location, login, and
 * password
 * @returns {Object} Request options
 */
function userRequestOptions(uiOptions) {
  // Retrieve the first 100 users with similar names.  This is just a
  // demonstration- if we wanted to productize, we'd need to paginate.
  return {
    uri: `${uiOptions.wordpress_location}/wp-json/wp/v2/users`,
    qs: {
      search: uiOptions.login,
      page: '1',
      per_page: '100'
    },
    auth: {
      user: uiOptions.login,
      pass: uiOptions.password
    }
  };
}

/**
 * Receives administrator input via a POST from admin_ui, validates and
 * transforms the input to a standardized format, and POSTs standardized data
 * to Zendesk.
 * In case of error, displays same HTML as admin_ui (with some error info) to
 * allow administrator to correct the information.
 *
 * It can be tested like:
 *  curl -d "return_url=http://localhost:3000/end_ui&name=Test name&login=admin&password=123456&wordpress_location=http://WORDPRESS_HOST/" http://localhost:3000/admin_ui_2
 *
 * @param {Object} attributes Arguments passed from admin_ui, including name,
 *  login, password, wordpress_location, and return_url
 * @param {Object} res Response object to which HTML will be written
 */
exports.admin_ui_2 = (attributes, res) => {
  // Make a request to Wordpress to get user info.  This both allows us to
  // validate the information we were passed, and lets us record the ID of the
  // login, which we'll need later.
  request.get(
    userRequestOptions(attributes),
    (error, wordpressResponse, body) => {
      let users;
      let user;
      let adminHtml;
      let metadata;

      if (!error && wordpressResponse.statusCode === 200) {
        // Request to Wordpress was successful- did we find the user?
        users = JSON.parse(body);
        user = users.find(currentUser => {
          return currentUser.name === attributes.login;
        });

        if (typeof user === 'undefined') {
          // No user found, allow the admin to choose a different login
          adminHtml = adminUiHtml(
            attributes.name,
            attributes.login,
            attributes.password,
            attributes.wordpress_location,
            attributes.return_url,
            `Sorry, the user '${attributes.login}' was not found,
              please try again.`);
          res.send(adminHtml);

          return;
        }

        // Validation passed and user found.  Format the Wordpress data into
        // a string that we understand and can use later (e.g. in pull.)
        metadata = JSON.stringify({
          name: attributes.name,
          login: attributes.login,
          password: attributes.password,
          author: user.id,
          wordpress_location: attributes.wordpress_location
        });

        // Send the formatted data to Zendesk.  We do this by putting the info
        // into a form and then programmatically submitting the form.
        res.send(`<html><body>
          <form id="finish"
                method="post"
                action="${escapeString(attributes.return_url)}">
            <input type="hidden"
                   name="name"
                   value="${escapeString(attributes.name)}">
            <input type="hidden"
                   name="metadata"
                   value="${escapeString(metadata)}">
          </form>
          <script type="text/javascript">
            // Post the form
            var form = document.forms['finish'];
            form.submit();
          </script>
        </body></html>`);
      } else {
        // Our API call to Wordpress failed.  Alert the administrator and allow
        // them to edit the connection info.
        adminHtml = adminUiHtml(
          attributes.name,
          attributes.login,
          attributes.password,
          attributes.wordpress_location,
          attributes.return_url,
          `Sorry, we were unable to connect to Wordpress at the requested
            location, please try again.`);
        res.send(adminHtml);
      }
    }
  );
};

/**
 * Calculates the request options to be used when requesting comment information
 * from the Wordpress API
 *
 * @param {Object} metadata Object containing wordpress_location, login, and
 * password
 * @param {Object} state Object containing most_recent_item_timestamp, or null
 * @returns {Object} Request options
 */
function pullRequestOptions(metadata, state) {
  // Get the most recent 100 comments, ordered by ID (we use ID as a proxy for
  // created time.)  This is just a demonstration- if we wanted to productize,
  // we'd need to make some feature decisions about how many comments we're
  // willing to look up, and we'd probably paginate.
  const options = {
    uri: `${metadata.wordpress_location}/wp-json/wp/v2/comments`,
    qs: {
      orderby: 'id',
      order: 'asc',
      page: '1',
      per_page: '100'
    },
    auth: {
      user: metadata.login,
      pass: metadata.password
    }
  };

  // If we've previously retrieved comments, then we only want to retrieve
  // comments that were made AFTER the most recent one we've previously seen.
  // That is, we don't want to get repeats.  This is just a demonstration- if we
  // wanted to productize, we'd want to deal with the case where there are new
  // comments with the same timestamp as a comment we've already seen.
  if (state && state.most_recent_item_timestamp) {
    options.qs.after = state.most_recent_item_timestamp;
  }

  return options;
}

/**
 * Removes HTML markup from a string
 *
 * @param {string} message String to be stripped
 * @returns {string} Stripped string
 */
function stripHTML(message) {
  // Strip HTML from the message
  const result = [];

  const parser = new htmlparser.Parser({
    ontext: text => {
      result.push(text);
    }
  }, { decodeEntities: true });

  parser.write(message);
  parser.end();

  return result.join('');
}

/**
 * Converts an array of Wordpress comments, as returned by the Wordpress API,
 * into an array of data suitable for returning to Zendesk
 *
 * @param {Array} comments Array of comments as returned by Wordpress API
 * @returns {Array} Comments transformed to Zendesk format
 */
function transformComments(comments) {
  let link;

  return comments.length ? comments.map(comment => {
    link = comment.link;

    return {
      external_id: externalCommentId(link, comment.id, comment.post),
      message: stripHTML(comment.content.rendered),
      parent_id: externalCommentId(link, comment.parent, comment.post),
      created_at: (new Date(comment.date_gmt)).toISOString(),
      author: {
        external_id: comment.author.toString(),
        name: comment.author_name || 'Anonymous'
      }
    };
  }) : [];
}

/**
 * Calculates the pull state for an integration.  This encapsulates the created
 * date of the last comment.  If there are no comments, it's the previous state.
 *
 * @param {Array} comments The array of comments, as returned by the Wordpress
 * API
 * @param {Array} previousState The previous pull state, or null
 * @returns {Object} Pull state object
 */
function pullState(comments, previousState) {
  if (!comments || !comments.length) {
    return previousState || {};
  }

  return {
    most_recent_item_timestamp: comments[comments.length - 1].date_gmt
  };
}

/**
 * Receives metadata and state from Zendesk, makes API calls to Wordpress, and
 * returns formatted data to Zendesk.
 *
 * It can be tested like:
 *  curl -d "metadata={\"password\":\"123456\", \"login\":\"admin\", \"wordpress_location\":\"http://WORDPRESS_HOST/\",\"author\":\"1\"}&state={}" http://localhost:3000/pull
 *
 * @param {Object} metadata The metadata containing connection information for
 *  Wordpress, etc.  This was created by admin_ui_2.
 * @param {Object} state The current state of pull.  In our case, this contains
 *  a timestamp of the most recent comment we've successfully imported.
 * @param {Object} res Response object to which JSON results will be written
 */
exports.pull = (metadata, state, res) => {
  request.get(
    pullRequestOptions(metadata, state),
    (error, wordpressResponse, body) => {
      let bodyInfo;
      let transformedComments;
      let newState;
      let errorDescription;

      if (!error && wordpressResponse.statusCode === 200) {
        try {
          bodyInfo = JSON.parse(body);
          transformedComments = transformComments(bodyInfo);
          newState = pullState(bodyInfo, state);
          res.send({
            external_resources: transformedComments,
            state: JSON.stringify(newState)
          });
        } catch (e) {
          // Bad/unexpected data from Wordpress
          // 502 == bad gateway
          res.sendStatus(502);
        }
      } else if (wordpressResponse && wordpressResponse.statusCode) {
        // Wordpress returned an error, pass through the status code and
        // error description
        errorDescription = {};
        if (body) errorDescription = { error_info: body };
        res.status(wordpressResponse.statusCode).send(errorDescription);
      } else {
        // Networking error or similar- no response
        // 503 == service unavailable
        res.sendStatus(503);
      }
    }
  );
};

/**
 * Calculates the request options to be used when performing a channelback to
 * the Wordpress API
 *
 * @param {Object} metadata Metadata containing wordpress_location
 * @param {string} parent ID of the comment to which we're making a response
 * @param {string} post ID of the post containing the comment
 * @param {string} content The text of the comment we're creating
 * @returns {Object} Post options
 */
function channelbackOptions(metadata, parent, post, content) {
  // Parameters for a POST to Wordpress to make a new comment in response to
  // a pre-existing comment.
  return {
    uri: `${metadata.wordpress_location}/wp-json/wp/v2/comments`,
    qs: {
      parent,
      post,
      author: metadata.author,
      content
    },
    auth: {
      user: metadata.login,
      pass: metadata.password
    }
  };
}

/**
 * Channelback is invoked when Zendesk agents to respond to Wordpress comment
 * in the Zendesk/AnyChannel ticket lifecycle. The Zendesk/AnyChannel ticket
 * lifecycle is:
 * 1. An end user makes a comment in Wordpress
 * 2. Zendesk invokes the "pull" method
 * 3. The "pull" method returns data about the Wordpress comment
 * 4. Zendesk creates a Ticket to represent the Wordpress comment
 * 5. A Zendesk agent responds to the Zendesk Ticket by creating a new Zendesk
 *    Comment
 * 6. Zendesk invokes the "channelback" method, passing along data about the
 *    Zendesk Comment
 * 7. The "channelback" method creates a Wordpress comment to represent the
 *    Zendesk comment
 *
 * It can be tested like:
 *  curl -d "metadata={\"password\":\"123456\", \"login\":\"admin\", \"wordpress_location\":\"http://WORDPRESS_HOST/\",\"author\":\"1\"}&parent_id=5:11:http://WORDPRESS_HOST/2016/06/07/another-post-testing-stuff/#comment-11&message=test_channelback_message&recipient_id=123&request_unique_identifier=234" http://localhost:3000/channelback
 *
 * @param {Object} metadata The metadata containing connection information for
 *  Wordpress, etc.  This was created by admin_ui_2.
 * @param {string} parentId The ID of the Wordpress comment to which the agent
 *  is responding.  This is the decorated ID, as returned by
 *  "externalCommentId."
 * @param {string} channelbackMessage The text of the Wordpress comment we're
 *  creating
 * @param {Object} res Response object to which JSON results will be written
 */
exports.channelback = (metadata, parentId, channelbackMessage, channelbackAttachmentUrls, res) => {
  // Wordpress doesn't support adding attachments to comments out-of-the-box, so
  // we'll append the URLs to the comment.  This is NOT A GOOD IDEA in general
  // since the URLs may be secured or may not be available in the future.
  // Normally, we'd download the attachment (using the push OAuth token), then
  // upload it to the origin service.
  if (channelbackAttachmentUrls != null) {
    var arrayLength = channelbackAttachmentUrls.length;
    channelbackMessage += '\n\nAttachments:'
    for (var i = 0; i < arrayLength; i++) {
      channelbackMessage += '\n' + channelbackAttachmentUrls[i];
    }
  }

  const postId = parseExternalCommentId(parentId).post_id;
  const options = channelbackOptions(
    metadata,
    parseExternalCommentId(parentId).comment_id,
    postId,
    channelbackMessage);
  let bodyInfo;
  let errorDescription;

  request.post(
    options,
    (error, wordpressResponse, body) => {
      if (!error && wordpressResponse.statusCode === 201) {
        // Successfully created Wordpress comment.  Return the ID of the new
        // comment.
        bodyInfo = JSON.parse(body);
        res.status(200).send({
          external_id: externalCommentId(
                        parseExternalCommentId(parentId).link,
                        bodyInfo.id,
                        postId)
        });
      } else if (wordpressResponse && wordpressResponse.statusCode) {
        // Wordpress returned an error
        errorDescription = {};
        if (body) errorDescription = { error_info: body };
        res.status(wordpressResponse.statusCode).send(errorDescription);
      } else {
        // Networking error or similar- no response
        // 503 == service unavailable
        res.sendStatus(503);
      }
    }
  );
};

/**
 * When a Zendesk agent wishes to see the original Wordpress comment associated
 * with a Zendesk Ticket, Zendesk redirects the agents browser to the
 * clickthrough
 *
 * @param {string} externalId The ID of the Wordpress comment.  This is the
 * decorated ID, as returned by "externalCommentId."
 * @param {Object} res Response object which will redirect the browser
 */
exports.clickthrough = (externalId, res) => {
  res.redirect(parseExternalCommentId(externalId).link);
};

/**
 * Zendesk may request the healthcheck endpoint to assure that the integration
 * is running and healthy
 *
 * @param {Object} res Response object used to return health information
 */
exports.healthcheck = res => {
  res.sendStatus(200);
};

/**
 * When Zendesk performs an event on our behalf, it will report the event by
 * calling this endpoint.  It will POST info about the event.  We will log the
 * event information for debugging purposes.
 *
 * @param {Object} body The request body, which contains the JSON data that was
 * posted
 * @param {Object} res Response object to which results will be written
 */
exports.eventCallback = (body, res) => {
  console.log('Event callback:');
  console.log(body);
  res.sendStatus(200);
};

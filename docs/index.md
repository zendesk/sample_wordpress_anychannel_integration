## Channel framework startup tutorial

This tutorial consists of the following sections:

- [Overview](#overview)
- [Known issues](#known-issues)
- [Step 1: Setup the developer environment](#step-1-setup-the-developer-environment)
- [Step 2: Get resources from the origin service (Polling)](##step-2-get-resources-from-the-origin-service-polling)
- [Step 3: Add logging of event callbacks](#step-3-add-logging-of-event-callbacks)
- [Step 4: Post new resources to the origin service (Channelback)](#step-4-post-new-resources-to-the-origin-service-channelback)
- [Step 5: Connect the integration service to Zendesk Support - Part 1 (Admin UI, Manifest)](#step-5-connect-the-integration-service-to-zendesk-support---part-1-admin-ui-manifest)
- [Step 6: Connect the integration service to Zendesk Support - Part 2 (Zendesk app)](#step-6-connect-the-integration-service-to-zendesk-support---part-2-zendesk-app)
- [Step 7: Store state information in Zendesk Support (Metadata, Pull State)](#step-7-store-state-information-in-zendesk-support-metadata-pull-state)
- [Step 8: Provide native resource links in Zendesk Support (Clickthrough)](#step-8-provide-native-resource-links-in-zendesk-support-clickthrough)
- [Appendix: Environment Setup](#appendix-environment-setup)


### Overview
The Channel framework lets you integrate origin services with Zendesk Support. It enables mirroring content between those origin services and Zendesk Support and agents to support customers on origin services through Zendesk Support.

In this tutorial, you'll build an integration service for WordPress.  Zendesk Support will call the integration service periodically, converting WordPress blog comments into Zendesk Support tickets and comments. Agents can respond in Zendesk Support.  The Channel framework sends these agent responses to the integration service, which creates corresponding comments in WordPress.

#### Difference between integrating with the Channel framework and the Zendesk REST API
Building an integration using the Zendesk REST API requires extensive knowledge of the Zendesk Support data model, and of course of the Zendesk API.
Building an integration using the Channel framework doesn’t require any knowledge of the Zendesk Support data model or APIs.  Instead, the integration exposes itself as a web service.  It implements methods specified by Zendesk Support, but it doesn’t need to call Zendesk Support at all.  The methods it exposes are not dependent on internal Zendesk Support details.

#### Intended audiences
This tutorial is for developers building integrations between origin services and Zendesk Support. This is a beginner-level tutorial that goes over basic Channel framework concepts. Basic JavaScript proficiency is required.

#### Prerequisites
This tutorial requires you to:
* Install applications on your computer. (Note: We have not tested the instructions with role escalation. You may need extra configuration if you're sudoing.)
* Use the `curl` command for testing.
* Have access to a Zendesk Support account for testing

This tutorial uses WordPress as the origin service. To run everything in this tutorial, you need:
* Database for WordPress
* [WordPress](https://codex.wordpress.org/Installing_WordPress)
* "rest-api" WordPress plugin
* "JSON Basic Authentication" WordPress plugin
* Node for integration service
* [Ruby for the Zendesk App Tools](https://help.zendesk.com/hc/en-us/articles/229489288)

Refer to the installation instructions of these applications on how to install them.


### Known issues

This tutorial was created in 2017 and some information about WordPress may be out of date.

Specifically, WordPress and mySql have changed behaviors since the tutorial was created a few years back:

- the WordPress plugin used to do REST API calls is no longer necessary as of quite a while ago
- the WordPress user needs to be updated for the mySQL connection to work
- the way the service's code is written, you have to have a non-plain permalink specified under preferences. The value of "plain" is the default, so this needs to be changed by the WordPress administrator.

These and other issues are detailed below.

#### Wordpress rest-api plugin

The recommended WordPress rest-api library is no longer maintained. According to [WordPress](https://wordpress.org/plugins/rest-api/), the plugin "hasn’t been tested with the latest 3 major releases of WordPress. It may no longer be maintained or supported and may have compatibility issues when used with more recent versions of WordPress."

The plug-in is no longer needed with the latest WordPress. The user is given a link to download.

#### mySql connector error

Connection error:

`mysqli_connect: authentication method unknown to the client [caching_sha2_password]`

Run this command as root for mySql connector to work:

`ALTER USER 'wordpress' IDENTIFIED WITH mysql_native_password BY 'wordpress';`

#### WordPress permalinks

Because of the way the newer version of WordPress works and exposes its API, you need to, as the WP admin, go in and change from "plain" permalinks to "not plain" permalink. If this is not done, the example code will not work.

You do however need to change from default permalink. If you use "plain", the WordPress REST API doesn't work. It just returns 200 with no data. See https://wordpress.stackexchange.com/questions/273144/can-i-use-rest-api-on-plain-permalink-format.

So https://wordpress.org/wp-json/wp/v2/ would become https://wordpress.org/?rest_route=/wp/v2 to give you a more complete example.

If you're using non-pretty permalinks (a.k.a. "plain" permalinks), you should pass the REST API route as a query string parameter. Hence the route http://oursite.com/wp-json/ in the example above would be http://oursite.com/?rest_route=/.

Example: http://127.0.0.1:25789/?rest_route=/wp/v2/users

However, http://127.0.0.1:25789/wp-json/ works when on "not plain" permalink.

#### Password in curl command

Had trouble running the curl command in the tutorial. Putting password inline with curl, it wasn't encoding correctly.

Example password: `JrAVUAis59vGfQSg$P`

https://wordpress.org/support/topic/disable-auto-generate-password/

I had to leave it out of the `--user "username:password"` format in the example and just give `--user "username"` and then enter at the command prompt the password. Then it worked.

If I escaped the `$` character in the pasword, it worked:

`curl -v --user "jdoe:JrAVUAis59vGfQSg\$P" http://127.0.0.1:25789/wp-json/wp/v2/users`

Since Wordpress uses strong passwords, make sure you escape any special characters and use the above as an example.

#### Step 2 and 3 out of sync with example

Steps 2 and 3 of the tutorial are out of sync with what's in the github repo example and the code related to event_callback is incomplete and doesn't work.

Step 2 had all code from tutorial commented out. Step 3 talked about adding eventcallback event, but the code given in tutorial was not in wordpress.js. In fact, "Step 3" was the channelback step in the code, not the event callback code.

- Code displayed in the tutorial has 'eventCallback' declared but no route to call it in server.js, so the example code is incomplete and doesn't work. Add event_callback_url endpoint into server.js.

- Express code needs this line to support application/json content type (otherwise JSON won't come through successfully)

  ```
  app.use(bodyParser.json());  // Needed when "Content-type: application/json" is used for POST
  ```

- Need to add event_callback to manifest in wordpress.js:

    ```
    exports.manifest = res => {
    ...
    ... snip,
          event_callback_url: './event_callback'
    ...snip
    ```

- Need to add Express JSON support into server.js.


### Step 1: Setup the developer environment
To run this tutorial, you need to set up the following applications:

* A working local WordPress instance. You can use a WordPress docker image or install WordPress locally. After that, install the necessary plugins for WordPress to respond to the integration service through the REST API.

	(Zendesk doesn’t recommend using a public WordPress instance. The code uses simple authentication and creates test comments. These choices may not be acceptable for public WordPress instances. This tutorial can’t be completed using WordPress.com because it does not support plugins.)

* A development environment in which to run the integration service Node application. The setup instructions have information on how to run and expose a local integration service to public network for Zendesk Support to connect.

Before setting up your environment, download the source code for this tutorial from Github.

[**Figure out how to refer to the setup suggestion**](https://docs.google.com/document/d/1EV_gKfP6xJSD0svgWzBH5cehz9FN2YD-ewsbLN8ef-Q/edit#)

After setting everything up, verify the setup by:

* Running `node server.js` at the local source code directory. The integration service should start listening at `localhost:3000`

* Verifying the server is running by visiting `http://localhost:3000/healthcheck` in a browser; you should get OK back.

After every testable change throughout the tutorial, press **Ctrl+C** to stop the integration service and restart it using `node server.js` command. This ensures that the integration service is using your latest changes.

In this tutorial, you will verify each step using curl.  The verification commands require the WordPress url, user name and password. You can set shell variables to make this easier.

```
export WORDPRESS_URL=http://localhost:25789/
export WORDPRESS_USER=lchan
export WORDPRESS_PASSWORD=lchan
```

**Note**: The integration service exposes the endpoint using routes defined in server.js. Read server.js if you want more information about the Node Express service.

**Note**: This tutorial does not provide  line-by-line commentary for some helper methods defined in wordpress.js. Read wordpress.js to see the implementations of those methods.

### Step 2: Get resources from the origin service (Polling)
In this step, you add an endpoint to support polling.  Zendesk Support will periodically POST to your endpoint.  Your code will retrieve data from the WordPress API, transform it to a format readable by Zendesk Support, and return it to the caller.

To query the WordPress REST API, the integration service needs connection parameters such as the REST endpoint URL, user information, and ordering parameters. The `pullRequestOptions` function formats this information for use with the networking library.

In wordpress.js, add the `pullRequestOptions` function:

```javascript
function pullRequestOptions(metadata, state) {
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

  if (state && state.most_recent_item_timestamp) {
    options.qs.after = state.most_recent_item_timestamp;
  }

  return options;
}
```

When the integration service receives a response from WordPress, the integration service needs to transform the data to Zendesk Support format.

In wordpress.js, add the `transformComments` logic:

```javascript
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
```

In wordpress.js, add the pull logic:

```javascript
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
          // Bad/unexpected data from WordPress
          // 502 == bad gateway
          res.sendStatus(502);
        }
      } else if (wordpressResponse && wordpressResponse.statusCode) {
        // WordPress returned an error, pass through the status code and
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
```

This is a lot of code, but don’t worry, we’ll explain the pull function in detail.

On line three, we call `pullRequestOptions` to set up the GET request parameters.  On line two, we perform the GET to WordPress based on those parameters.

Everything else is a callback function to handle the response from WordPress.

Lines 11-23 handle the success case. The code parses the response from WordPress and converts it to the Zendesk Support format by calling `transformComments`. More details on the Zendesk Support format are available in the [Channel framework documentation](https://developer.zendesk.com/apps/docs/channels-framework/pull_endpoint).

Lines 20-22 handle errors raised by the integration code. Read the documentation on how Zendesk Support [handles errors](https://developer.zendesk.com/apps/docs/channels-framework/pull_endpoint#recognized-error-responses) from integration services for details.

Now you can verify step 2 works by using curl to hit the pull endpoint.

Start the server by running `node server.js` in the integration service directory (the location of wordpress.js). The integration service will be available at http://localhost:3000.

[Set the WordPress variables](point to Step1) and run this `curl` command:

```
curl -d "metadata={\"password\":\"$WORDPRESS_PASSWORD\", \"login\":\"$WORDPRESS_USER\", \"wordpress_location\":\"$WORDPRESS_URL\",\"author\":\"1\"}&state={}" http://localhost:3000/pull
```

This command posts to the pull endpoint you built. It passes the metadata and state for calling WordPress. Your `pullRequestOptions` function processes the metadata and state. We will discuss metadata and state later. If you have created some WordPress posts and comments, the response should look similar to this:

```
{"external_resources":[{"external_id":"8:2:http://localhost:25789/index.php/rick-astley-50/#comment-2","message":"Never Gonna Give You Up.\n","parent_id":"8:0:http://localhost:25789/index.php/rick-astley-50/#comment-0","created_at":"2016-07-19T22:56:33.000Z","author":{"external_id":"1","name":"lchan"}}],"state":"{\"most_recent_item_timestamp\":\"2016-07-19T22:56:33\"}"}
```

### Step 3: Add logging of event callbacks
When Zendesk performs an action for our integration, it can call back to your service via a webhook style callback to let us know what happened.  This is particularly helpful when debugging problems with your service.

To support event callbacks, add the `eventCallback` function to wordpress.js:

```javascript
exports.eventCallback = (body, res) => {
  console.log('Event callback:');
  console.log(body);
  res.sendStatus(200);
};
```

You can test this by POSTing data to the event callback endpoint, and verifying that you see the POSTed data logged out by your service, like this:

```
curl -X POST -d '{"some key":"some value"}' -H "Content-Type: application/json" http://localhost:3000/event_callback
```

### Step 4: Post new resources to the origin service (Channelback)
In this step you will add an endpoint to post comments from Zendesk Support to WordPress.  It will return the external id of the newly created WordPress comment back to Zendesk Support.

To make a comment using the WordPress REST API, the integration service needs the endpoint URL, user information, the comment text for the new comment, and the identifier of the comment the agent is replying to.  We’ll handle this logic in the `channelbackOptions` function.

Add the `channelbackOptions` function to wordpress.js:

```javascript
function channelbackOptions(metadata, parent, post, content) {
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
```

The main difference between this and `pullRequestOption` is the query parameters `qs`, on lines 5-8. `channelbackOptions` specifies the comment the agent wanted to post back `content`, the author of this new content `author` and the `parent` and `post` WordPress ids to tell WordPress to which comment the agent is replying.

Now you can add logic to post the new comment to WordPress using the request options.

In wordpress.js, add the channelback logic:

```javascript
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
        // Successfully created WordPress comment.  Return the ID of the new
        // comment.
        bodyInfo = JSON.parse(body);
        res.status(200).send({
          external_id: externalCommentId(
                        parseExternalCommentId(parentId).link,
                        bodyInfo.id,
                        postId)
        });
      } else if (wordpressResponse && wordpressResponse.statusCode) {
        // WordPress returned an error
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
```

Lines 2-13 report any channelback attachment URLs that were POSTed to the integration. In a robust integration, these URLs would be used to download the attachments and then upload them to the origin system.  However, Wordpress doesn't support attaching files to comments, so we will not implement that logic. A production oriented implementation of the Wordpress integration would probably not support attachments at all. Instead, the manifest would indicate that attachments are not supported.

Line 15 parses the external id to get the post id we are going to reply to. See the [External IDs](#external-ids) for more information. Lines 16-20 prepare the parameters which will be POSTed to the WordPress API. Line 26 posts the request to WordPress. Similar to the pull implementation, line 26 passes a response handler function to the post call.

Lines 28-36 are invoked when WordPress returns HTTP status code 201 (Created). The handler parses the response from WordPress on line 30, creates the external id for Zendesk Support on lines 32-34, and returns 200 (OK) to Zendesk Support with the external id. Zendesk Support records the external ID.  If it sees this external ID in a future poll, Zendesk Support will not import it again.

If WordPress returns an error or the network request times out, lines 38-41 and 43-45 return appropriate error codes back to Zendesk Support. Read [the pull request documentation](https://developer.zendesk.com/apps/docs/channels-framework/pull_endpoint#recognized-error-responses) on how Zendesk Support handles errors from integration service.

To recap: In this step you added logic to turn Zendesk Support comments into WordPress comments by generating the appropriate WordPress API parameters.  You also generated an external ID for the WordPress comment.

#### External IDs

Here is the explanation of what does external ids mean in the Channels Framework. Zendesk Support uses external ids to determine if an external resource has been previously imported. Zendesk Support also uses external ids to specify which external resource is being replied to. The external id is created by the integration service, and each external resource must have a unique external id.

Integration services identify resources by “external id.” In Zendesk Support, the term “external id” refers to identifiers used by the integration service itself, which may or may not match IDs in the origin system, and will not match IDs inside of Zendesk Support.

For example, suppose you were creating an integration service for Stack Overflow. Stack Overflow might have a question with ID 1234, and that question might contain a comment with ID 5678. Stack Overflow might not guarantee that comment IDs are globally unique. The id 5678 might not be enough to uniquely discover a comment in Stack Overflow- you also need to know that comment 5678 is on question 1234. You might form an external ID for a Stack Overflow comment by concatenating the comment ID and the question ID with a separator, like “1234:5678”. Comment ID 5678 in Stack Overflow is represented by external ID “1234:5678” in the integration. In turn, that Stack Overflow comment might be imported into Zendesk Support as comment 9876. The same Stack Overflow comment has 3 IDs- it’s called 5678 in Stack Overflow, it’s called “1234:5678”, and it’s called comment 9876 in Zendesk Support. Zendesk Support never needs to know about the ID in Stack Overflow- it only deals with “external IDs” (like “1234:5678”), and Zendesk Support internal IDs.

This tutorial integrates with WordPress, and the external ID is formed by concatenating the post id, comment id and the post link, delimited by colons (for example, `8:2:http://localhost:25789/index.php/rick-astley-50/#comment-2`). We will discuss later why the integration service needs the link in external id.

Read the `externalCommentId` and `parseExternalCommentId` functions to see how our integration service handles external ids.

Now you can verify that your implementation works by curl'ing both the pull and channelback endpoints. (Note: This assumes you have completed step 2.)

Make sure there is at least one comment in WordPress. Restart the server, [set the WordPress variables](point to Step1), and run this `curl` command to pull.  You’ll use the results to get the external id of a WordPress comment, which you’ll pass to the channelback command.

```
curl -d "metadata={\"password\":\"$WORDPRESS_PASSWORD\", \"login\":\"$WORDPRESS_USER\", \"wordpress_location\":\"$WORDPRESS_URL\",\"author\":\"1\"}&state={}" http://localhost:3000/pull
```

The result should include an external ID for a WordPress comment. After that, run this `curl` command to channelback:

```
curl -d "metadata={\"password\":\"$WORDPRESS_PASSWORD\", \"login\":\"$WORDPRESS_USER\", \"wordpress_location\":\"$WORDPRESS_URL\",\"author\":\"1\"}&parent_id=<external id of the wordpress comment to reply>&message=<message>" http://localhost:3000/channelback
(Add a message and set parent_id with the external_id you get from the pull command)
```

You should get a response like this:

```
{"external_id":"8:3:http://localhost:25789/index.php/rick-astley-50/#comment-3"}
```

Also, if you go to the WordPress UI, you should see the new comment created by the channelback.


### Step 5: Connect the integration service to Zendesk Support - Part 1 (Admin UI, Manifest)

After the previous two steps, you have an integration service that communicates with WordPress in both directions. The next step is to wire this up with Zendesk Support so it knows where the integration service is and what capabilities the integration service has.

#### Step 5A: Create the manifest

Integration services are self-describing. They expose a manifest which describes their attributes and capabilities in JSON. The manifest includes the name, globally unique id, author, version, and a list of all reachable endpoints on the integration service.

In wordpress.js, add the following code:

```javascript
exports.manifest = res => {
  res.send({
    name: 'WordPress',
    id: 'com.zendesk.anychannel.integrations.wordpress',
    author: 'Zendesk',
    version: 'v0.0.1',
    channelback_files: true,
    urls: {
      admin_ui: './admin_ui',
      pull_url: './pull',
      channelback_url: './channelback',
      clickthrough_url: './clickthrough',
      healthcheck_url: './healthcheck'
    }
  });
};
```

This returns the manifest JSON. The endpoints you built in step 2 and 3 are described in pull_url and channelback_url respectively.

Now you can verify manifest endpoint works with curl.

Restart the server and run this `curl` command:

```
curl http://localhost:3000/manifest
```

You should get a JSON string like:

```
{"name":"WordPress","id":"com.zendesk.anychannel.integrations.wordpress","author":"Zendesk","version":"v0.0.1","urls":{"admin_ui":"./admin_ui","pull_url":"./pull","channelback_url":"./channelback","clickthrough_url":"./clickthrough","healthcheck_url":"./healthcheck"}}
```

#### Step 5B:  Allow the Zendesk Support admin to set up the Integration Service

You have now built the necessary API endpoints for the Channel framework to interact with the integration service. However, the integration service doesn’t have a way for the Zendesk Support admin to provide WordPress login information. Now you are going to build the UI to collect the WordPress information from the Zendesk Support administrator.  Zendesk Support will store this information in an integration account. In the Channel framework, an integration account records information about an instance of the origin service. For example, an integration account for WordPress integration service stores connection information for a WordPress login.

In this step, you'll create a UI for collecting the WordPress information the integration service needs, and embed it into a Zendesk Support admin view. Here's a sample screenshot of the UI you will create:

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/cf_add_account.png" alt="cf_add_account.png">

**Note**: The warning message and surrounding decorations are implemented in Zendesk Support.  Only the form is implemented in the integration service.

First, implement the admin UI form.

In wordpress.js, add this `adminUiHtml` function:

```javascript
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
        WordPress location (URL):
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
```

This function returns the HTML for the input form as seen in the screenshot.
When the administrator is editing a pre-existing account, this form displays the previous values for name, login, and password. Therefore, this page can handle both creating new integration accounts and editing existing ones.  Lines 8, 10, 14, and 18 are examples.

Zendesk Support provides a return_url when displaying the admin UI. Once the administrator has POSTed the form to the integration service, it will format the data according to Zendesk Support’s requirements and POST it back to Zendesk Support via the the return_url.

On line 10, the code sets the target of this form to `./admin_ui_2` for subsequent processing.

#### Step 5C:  Handle the credentials entered by the Zendesk Support admin

After the Zendesk Support administrator enters the WordPress information, the integration service needs to save the information to use in future pull and channelback requests. Instead of storing this information local to the integration service, the Channel framework provides a simple way to store it inside Zendesk Support. The return_url mentioned above is the mechanism to store metadata in Zendesk Support.

In wordpress.js, add the ./admin_ui_2 function:

```javascript
exports.admin_ui_2 = (attributes, res) => {
  request.get(
    userRequestOptions(attributes),
    (error, wordpressResponse, body) => {
      let users;
      let user;
      let adminHtml;
      let metadata;

      if (!error && wordpressResponse.statusCode === 200) {
        // Request to WordPress was successful- did we find the user?
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

        // Validation passed and user found.  Format the WordPress data into
        // a string that we understand and can use later (e.g. in pull.)
        metadata = JSON.stringify({
          name: attributes.name,
          login: attributes.login,
          password: attributes.password,
          author: user.id,
          wordpress_location: attributes.wordpress_location
        });

        // Send the formatted data to Zendesk Support.  We do this by putting the info
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
        // Our API call to WordPress failed.  Alert the administrator and allow
        // them to edit the connection info.
        adminHtml = adminUiHtml(
          attributes.name,
          attributes.login,
          attributes.password,
          attributes.wordpress_location,
          attributes.return_url,
          `Sorry, we were unable to connect to WordPress at the requested location, please try again.`);
        res.send(adminHtml);
      }
    }
  );
};
```

On line 2, this function calls the WordPress API to retrieve user info. This verifies the WordPress user information provided by the admin. See the `userRequestOption` function for more information about the request parameters. Lines 9-69 handle the response we get from WordPress.

If WordPress returns a parsable response, lines 12-15 check if the user the admin specified is available in WordPress. If not, line 17-26  re-renders the admin_ui form with error `Sorry, the user '${attributes.login}` was not found, please try again.`

If the code finds the user, it knows the login is working. Line 30-36 combines all the login information into a JSON string (the metadata). Then in line 39-55, it passes the formatted information back to Zendesk Support, using a http form POST to the return url. This metadata is similar to what you used to test the pull and channelback endpoints.

If the code encounters any other errors, line 59-66 re-renders the admin_ui form with error `Sorry, we were unable to connect to WordPress at the requested location, please try again.`

**Note**: For ease of use and testing in this tutorial, the integration service uses basic authentication with an unencrypted password. This is not recommended for a production integration service.


### Step 6: Connect the integration service to Zendesk Support - Part 2 (Zendesk app)

After the work in step 4A, your integration service can return a manifest to Zendesk Support. The manifest describes the location of the other endpoints. However, you still need to inform Zendesk Support of the url to the manifest. This is done via Zendesk Apps requirements.

An app requirement is the way to specify app dependencies. In the Channel framework case, the dependency is “read the manifest and register the integration service.”

You need a Zendesk Support account to test this step.

Zendesk publishes sample apps in a [Github repository](https://github.com/zendesk/demo_apps). To get your Zendesk account working with your local integration, clone the repository and modify the requirements.json of [this sample app](https://github.com/zendesk/demo_apps/tree/master/v2/support/requirements_only_sample_app).

Replace everything in requirements.json with this:
```
{
  "channel_integrations": {
    "wordpress": {
      "manifest_url":
        "https://<integration_service_location>/manifest"
    }
  }
}
```
(See below for what `<integration_service_location>` is.)

In this tutorial, the integration service you built runs locally, so Zendesk Support can’t reach the integration service directly. To test the integration service, you can use a tunneling service. It is also possible to deploy the integration service to the public extranet. This tutorial doesn’t cover that. You can use the ngrok tunnel tool to allow Zendesk Support to communicate with the Integration Service running on your local machine.

1. Download the ngrok tunnel application from [ngrok website](https://ngrok.com/) and unzip it
2. Run `ngrok http 3000`. Ngrok will set up a public address for the WordPress integration service running on port 3000.

	<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-ngrokInterface.png" alt="Step5-ngrokInterface.png">

In the ngrok interface, you can see the resource name which you will put into requirements.json. In this example, it is https://5d2c0ccd.ngrok.io/

**Note**: The Channel framework requires https.

**Note**: The free version of ngrok doesn’t support a fixed subdomain. Make sure you don’t restart ngrok or you will need to modify and reinstall the Zendesk app again. It is fine to restart the integration service or WordPress server.

To build the Zendesk app, you need to have the Zendesk App Tool. Read the [Zendesk App Tool documentation](https://developer.zendesk.com/apps/docs/agent/tools#zendesk-app-tools) on how to install the tool and package the App.

After filling in the integration_service_location in requirements.json, run the `zat package` command in the /requirements_only_sample_app directory to get a Zendesk app zip file. Follow the [upload and install instruction](https://help.zendesk.com/hc/en-us/articles/229489328) to upload and install the local Zendesk app in your Zendesk Support instance.

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-ZendeskAppInstallationComplete.png" alt="Step5-ZendeskAppInstallationComplete.png">

After the Zendesk app installs successfully, you can navigate to the Channels > Channels Integration section in admin UI to see the newly added integration:

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-ChannelsIntegrationAdminUI.png" alt="Step5-ChannelsIntegrationAdminUI.png">

Navigate into the 'WordPress' integration and you can setup an integration account using the 'Add account' button:

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-AddIntegrationServiceAccountAddButton.png" alt="Step5-AddIntegrationServiceAccountAddButton.png">

You should see the Admin UI you built in Step 4:

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-EmbeddedAdminUIShowsUp.png" alt="Step5-EmbeddedAdminUIShowsUp.png">

If everything works successfully, the ngrok tunnel should show some pull calls from Zendesk Support after a few moments:

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step5-ngrokShowsPullRequests.png" alt="Step5-ngrokShowsPullRequests.png">

Comments on WordPress posts should become tickets inside your Zendesk Support instance.

In addition to setting up the integration service, the Zendesk app may also have other code in it to enhance the Zendesk Support UI. Read the [Zendesk Apps documentation](https://help.zendesk.com/hc/en-us/articles/229489128-Zendesk-Apps-framework-basics) for more information.

### Step 7: Store state information in Zendesk Support (Metadata, Pull State)
Zendesk Support can store metadata and state for your integration, which allows you to build integrations without worrying about data storage, security, backup, etc. (Note: This doesn’t prevent you to add data storage to integration service if needed.)

There are two kinds of data an integration service needs:

* Data about the integration account. For example, the WordPress service requires user login and WordPress location. Channel framework calls this the metadata.
* Data that describes the current state of pulls. For example, timestamp of the last imported comment for the WordPress integration service. Channel Framework calls this the pull state.

Zendesk Support can store these two pieces of information. Zendesk Support provides them when it calls the integration service:

* Pull calls and the admin UI will receive both the metadata and state
* Channelback calls will receive the metadata
Read the [metadata and state documentation](https://developer.zendesk.com/apps/docs/channels-framework/metadata_state#content) for more information on metadata and state.

Let’s review the code that handles this information.

In Step 4C, the integration service creates the metadata in this part of the response handler.

```javascript
        metadata = JSON.stringify({
          name: attributes.name,
          login: attributes.login,
          password: attributes.password,
          author: user.id,
          wordpress_location: attributes.wordpress_location
        });

        // Send the formatted data to Zendesk Support.  We do this by putting the info
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
```

When the integration service receives a successful login for WordPress during setup, line 1-7 packages the metadata into a JSON string. Line 11-27 returns that to Zendesk Support using the return url.

In Step 2, the code updates the state in the pull response handler:

```javascript
  newState = pullState(bodyInfo, state);
```

The pullState method is in wordpress.js:

```javascript
  function pullState(comments, previousState) {
    if (!comments || !comments.length) {
      return previousState || {};
    }

    return {
      most_recent_item_timestamp: comments[comments.length - 1].date_gmt
    };
  }
```

This method looks at the comments returned by WordPress. If there are any comments, the code extracts the timestamp of the most recent comment. The code puts that timestamp into the state.

The integration service returns state to Zendesk Support for every pull call, and receives the state back from Zendesk Support in the next pull call. The integration service uses state to decide what to query from WordPress. The code above demonstrated the integration can store state in Zendesk Support.

One thing to note - Zendesk Support never parses the metadata or state. This means that the integration service can use any format and any structure in these two fields, so long as it’s converted to a string. Both fields have length limit of 5000 characters.


### Step 8: Provide native resource links in Zendesk Support (Clickthrough)
At this point, you have a working integration between Zendesk Support and WordPress. To enhance the agent experience, you can add a clickthrough endpoint to allow agents to view the external resource natively. For example, after implementing clickthrough in the WordPress integration service, agents can click a link in the ticket to see the comment in the WordPress UI.

<img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/Step7-CommentUI.png" alt="Step7-CommentUI.png" />

The WordPress link highlighted in the screenshot illustrates how a clickthrough link would show up in Zendesk Support UI.

Add this clickthrough function inside wordpress.js:

```javascript
exports.clickthrough = (externalId, res) => {
  res.redirect(parseExternalCommentId(externalId).link);
};
```
This function redirects the requester to the WordPress comment location.

When the agent clicks the clickthrough link in the Zendesk Support UI, Zendesk Support sends the external id of that comment to the integration service as a parameter. This is the only data Zendesk Support sends - Zendesk Support does NOT send the metadata, as this would be insecure.

When our WordPress code constructs an external ID, it includes the post URL. The clickthrough code uses that portion of the external\_id. Previously, we discussed an example external\_id:

`8:2:http://localhost:25789/index.php/rick-astley-50/#comment-2`

You can see the comment URL has no relationship to the post\_id (post ID is 8, but the clickthrough URL doesn’t contain “8”.).

If you open any WordPress ticket in the Zendesk Support UI, you can click the link and see the comment in WordPress.

This concludes the tutorial for integration service. To recap, you did the following:

* Created a pull endpoint to fetch data from WordPress
* Created a channelback endpoint to post reply to WordPress
* Added the manifest telling Zendesk Support where the pull and post endpoints are located
* Added an admin ui allowing Zendesk Support admin to setup the WordPress integration
* Created a Zendesk app to register your new integration service with Zendesk Support
* Learned how to use Zendesk Support to store the metadata and state
* Created a clickthrough endpoint for viewing a comment natively in WordPress


### Appendix: Environment setup

**2020-09-14**: This setup guide was written in 2017. Some information may be out of date. See [Known issues](#known-issues).

#### Step 1: Set up WordPress locally

WordPress needs an RDBMS to store blog posts and comments. Here is one way to set up the database:

**To create a local DB (OSX instruction using Homebrew)**

1. Download and [install Homebrew](http://brew.sh/).

2. `brew install mysql`

3. `mysql.server start`

   May need to restart the machine if `mysql.server start` doesn’t work.

4. `mysql -u root -p` with no password (press Enter at the password prompt)

   This will open the mysql command prompt.

5. `CREATE USER 'wordpress'@'%' IDENTIFIED BY 'wordpress';`

6. `CREATE DATABASE wordpress;`

7. `GRANT ALL ON wordpress.* TO 'wordpress'@'%';`

To verify the `wordpress` user, run `mysql -u wordpress -p` in the terminal with password `wordpress`. The terminal should show a mysql prompt. Entering `SHOW DATABASES;` at the mysql prompt should show the `wordpress` database.

If you get the following connection error:

`mysqli_connect: authentication method unknown to the client [caching_sha2_password]`

Run this command as root for the mySql connector to work:

`ALTER USER 'wordpress' IDENTIFIED WITH mysql_native_password BY 'wordpress';`

Now you can run WordPress by installing locally.

**To run WordPress locally**

1. Make sure that the mysql server is running at localhost:3306 (if not, run `mysql.server start`).

2. Change directories to the sample integration service source directory.

3. `php -f scripts/test_database_connection.php`

    If the command prints `Connected successfully`, php and mysql are working.

    Common causes for failure include:
    * MySQL is not running on the correct host and port.
    * Your php version doesn't contain the correct MySQLi library.
    * On Mac OS X, you can install php (WordPress recommends 5.6 as of 15th July 2016) through [http://php-osx.liip.ch/].

6. Get the latest WordPress source code from https://wordpress.org/download/ and unzip it.

7. Change directories to the unzipped WordPress directory (where wp-login.php is located).

8. Run `php -S 127.0.0.1:25789` to start the WordPress server (the port number can be replaced by any unbound port on the machine).

9. Go to http://127.0.0.1:25789 in a browser. WordPress will guide you through the setup.

You need to install two WordPress plugins - rest-api for responding to API requests and JSON Basic Authentication for authentication.

**To install the WordPress "rest-api" plugin**

**2020-09-14**: The plug-in is no longer needed with the latest versions of WordPress. The user is given a link to download.

1. Open your local WordPress in a browser.

2. Log in as `admin/123456` or the username and password set up during WordPress config.

3. Navigate to Plugins/Add New.

4. Search for [WordPress REST API (Version 2)](https://wordpress.org/plugins/rest-api/).

5. Install the WP REST API plugin.

6. Activate the WP REST API plugin.

7. Verify the plugin is working by running `curl http://<Url and port of the WordPress Instance>/wp-json/wp/v2/posts`.

    Example: `curl http://127.0.0.1:25789/wp-json/wp/v2/posts`

    A JSON response that contains all the posts should be returned.

    If curling the endpoint returns html instead of json, in WordPress, go to Admin > Settings > Permalink and change the setting to Post name. That should fixes the issue. See [Original Issue](https://wordpress.org/support/topic/version-20-beta11-not-work-on-my-website-is-there-something-i-have-missed).


**To install the JSON Basic Authentication plugin**

1. Navigate to [https://github.com/WP-API/Basic-Auth].

2. Click "Clone or download".

3. Click [Download zip](https://github.com/WP-API/Basic-Auth/archive/master.zip) and save file locally.

4. In WordPress, navigate to Plugins/Add New.

5. Click Upload Plugin.

6. Choose the file you downloaded previously.

7. Install the JSON Basic Authentication plugin.

8. Activate the JSON Basic Authentication plugin.

9. Verify the plugin is working by running `curl -v --user <username>:<password> http://<Url and port of the WordPress Instance>/wp-json/wp/v2/users`.

    Example: `curl -v --user admin:123456 http://127.0.0.1:25789/wp-json/wp/v2/users`

    You should get the list of WordPress users, and the http headers should include Server auth using Basic with user `<username>`.

    <img src="https://zen-marketing-documentation.s3.amazonaws.com/docs/en/AppendixWordPressAuthScreenshot.png" width="500px"></img>

WordPress is set up correctly now. Create some blog posts and comments on those posts using the WordPress UI. The comments will show up in Zendesk Support once you finish the tutorial.

### Step 2: Set up the integration service environment
The tutorial integration service is written in Node using the Express framework. You can use any language or framework to build your own integration services. Zendesk recommends using OAuth and SSL with the external service whenever possible. Zendesk Support requires SSL when communicating with the integration service.

**To set up the Node/Express server**

1. Go to the [sample integration service source code directory](https://github.com/zendesk/sample_wordpress_anychannel_integration).

2. Download node from [https://nodejs.org/en/] and install it.

3. `nodenv local 5.7.0`

4. `npm install`

Now your environment is set up for the tutorial.

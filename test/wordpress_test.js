const wordpress = require('../wordpress.js');
const assert = require('chai').assert;
const httpMocks = require('node-mocks-http');
const sinon = require('sinon');
const request = require('request');

describe('Wordpress', function testWordpress() {
  var res;

  beforeEach(function before() {
    res = httpMocks.createResponse();
  });

  describe('#manifest()', function manifest() {
    it('should return manifest', function returnManifest() {
      wordpress.manifest(res);
      const expected = {
        name: 'Wordpress',
        id: 'com.zendesk.anychannel.integrations.wordpress',
        author: 'Zendesk',
        version: 'v0.0.1',
        urls:
         { admin_ui: './admin_ui',
           pull_url: './pull',
           channelback_url: './channelback',
           clickthrough_url: './clickthrough',
           healthcheck_url: './healthcheck',
           event_callback_url: './event_callback' } };

      assert.equal(200, res.statusCode);
      assert.deepEqual(expected, res._getData());
    });
  });

  describe('#admin_ui()', function adminUi() {
    it('should return the first page of the admin UI', function firstPage() {
      wordpress.admin_ui(
        'https://test.com/return_url"',
        'previous name"',
        {
          login: 'bob"',
          password: 'welcome"',
          wordpress_location: 'test_location"'
        },
        res
      );

      const expected = `<html><body>
      <form method="post" action = "./admin_ui_2">
        Name: <input type="text" name="name" value="previous name&quot;"><br>
        Login:
          <input type="text" name="login" value="bob&quot;"><br>
        Password:
          <input type="password"
                 name="password"
                 value="welcome&quot;"><br>
        Wordpress location (URL):
          <input type="text"
                 name="wordpress_location"
                 value="test_location&quot;"><br>
        <input type="hidden"
               name="return_url"
               value="https://test.com/return_url&quot;"></input>
        \n        <input type="submit">
      </form>
    </body></html>`;

      assert.equal(200, res.statusCode);
      assert.deepEqual(expected, res._getData());
    });
  });

  describe('#admin_ui_2()', function adminUi2() {
    var standardAttributes = {
      name: 'previous name"',
      login: 'bob"',
      password: 'welcome"',
      wordpress_location: 'http://wordpress.test.com',
      return_url: 'https://test.com/return_url"'
    };

    describe('Request to Wordpress fails', function requestFails() {
      var oldGet;

      beforeEach(function before() {
        oldGet = request.get;
        sinon.stub(request, 'get', function onGet(options, callback) {
          callback(
            {},                     // error
            { statusCode: 404 },    // response
            '[]'                    // body
          );
        });
      });

      afterEach(function after() {
        request.get = oldGet;
      });

      it('displays main UI with warning', function withWarning() {
        wordpress.admin_ui_2(standardAttributes, res);

        const expected = `<html><body>
      <form method="post" action = "./admin_ui_2">
        Name: <input type="text" name="name" value="previous name&quot;"><br>
        Login:
          <input type="text" name="login" value="bob&quot;"><br>
        Password:
          <input type="password"
                 name="password"
                 value="welcome&quot;"><br>
        Wordpress location (URL):
          <input type="text"
                 name="wordpress_location"
                 value="http://wordpress.test.com"><br>
        <input type="hidden"
               name="return_url"
               value="https://test.com/return_url&quot;"></input>
        Sorry, we were unable to connect to Wordpress at the requested
            location, please try again.<br>
        <input type="submit">
      </form>
    </body></html>`;

        assert.equal(200, res.statusCode);
        assert.deepEqual(expected, res._getData());
      });
    });

    describe('Request to Wordpress succeeds', function succeeds() {
      describe('Response from Wordpress includes user', function includeUser() {
        var oldGet;

        beforeEach(function before() {
          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              null,                                 // error
              { statusCode: 200 },                  // response
              '[{"name": "bob\\"", "id": "123"}]'  // body
            );
          });

          wordpress.admin_ui_2(standardAttributes, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('displays form which posts back to Zendesk', function displayForm() {
          const metadata = JSON.stringify({
            name: 'previous name"',
            login: 'bob"',
            password: 'welcome"',
            author: '123',
            wordpress_location: 'http://wordpress.test.com'
          });
          const escapedMetadata = metadata.replace(/"/g, '&quot;');

          const expected = `<html><body>
          <form id="finish"
                method="post"
                action="https://test.com/return_url&quot;">
            <input type="hidden"
                   name="name"
                   value="previous name&quot;">
            <input type="hidden"
                   name="metadata"
                   value="${escapedMetadata}">
          </form>
          <script type="text/javascript">
            // Post the form
            var form = document.forms['finish'];
            form.submit();
          </script>
        </body></html>`;

          assert.equal(200, res.statusCode);
          assert.deepEqual(expected, res._getData());
        });
      });

      describe('Response from wordpress doesn\'t have user', function noUser() {
        var oldGet;

        beforeEach(function before() {
          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              null,                   // error
              { statusCode: 200 },    // response
              '[]'                    // body
            );
          });

          wordpress.admin_ui_2(standardAttributes, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('displays main UI with warning', function userWarning() {
          const expected = `<html><body>
      <form method="post" action = "./admin_ui_2">
        Name: <input type="text" name="name" value="previous name&quot;"><br>
        Login:
          <input type="text" name="login" value="bob&quot;"><br>
        Password:
          <input type="password"
                 name="password"
                 value="welcome&quot;"><br>
        Wordpress location (URL):
          <input type="text"
                 name="wordpress_location"
                 value="http://wordpress.test.com"><br>
        <input type="hidden"
               name="return_url"
               value="https://test.com/return_url&quot;"></input>
        Sorry, the user 'bob"' was not found,
              please try again.<br>
        <input type="submit">
      </form>
    </body></html>`;

          assert.equal(200, res.statusCode);
          assert.deepEqual(expected, res._getData());
        });
      });
    });
  });

  describe('#pull()', function testPull() {
    var login = 'agent';
    var password = '123456';
    var wordpressLocation = 'wordpress.com';
    var metadata = {
      login,
      password,
      wordpress_location: wordpressLocation
    };
    var state = {};
    var link = 'test.com/link';
    var id = '123';
    var parent = '234';
    var post = '345';
    var dateGmt = '2016-07-06T20:03:29';
    var comment = '<b>rendered comment</b>';
    var strippedComment = 'rendered comment';
    var authorName = 'billy';
    var author = '456';
    var oldGet;

    describe('request succeeds', function requestSucceeds() {
      describe('parseable response', function parseableResponse() {
        describe('has author name', function hasAuthor() {
          beforeEach(function before() {
            var response = [
              {
                link,
                id,
                parent,
                post,
                content: {
                  rendered: comment
                },
                date_gmt: dateGmt,
                author,
                author_name: authorName
              }
            ];
            var expectedRequest = {
              auth: {
                pass: password,
                user: login
              },
              qs: {
                orderby: 'id',
                order: 'asc',
                page: '1',
                per_page: '100'
              },
              uri: `${wordpressLocation}/wp-json/wp/v2/comments`
            };

            oldGet = request.get;
            sinon.stub(request, 'get', function onGet(options, callback) {
              assert.deepEqual(expectedRequest, options);

              callback(
                null,                     // error
                { statusCode: 200 },      // response
                JSON.stringify(response)  // body
              );
            });

            wordpress.pull(metadata, state, res);
          });

          afterEach(function after() {
            request.get = oldGet;
          });

          it('returns transformed results', function transformedResults() {
            var expected = {
              external_resources: [
                {
                  author: {
                    external_id: author,
                    name: authorName
                  },
                  created_at: '2016-07-06T20:03:29.000Z',
                  external_id: `${post}:${id}:${link}`,
                  message: strippedComment,
                  parent_id: `${post}:${parent}:${link}`
                }
              ],
              state: `{"most_recent_item_timestamp":"${dateGmt}"}`
            };

            assert.equal(200, res.statusCode);
            assert.deepEqual(expected, res._getData());
          });
        });

        describe('no author name', function noAuthor() {
          beforeEach(function before() {
            var response = [
              {
                link,
                id,
                parent,
                post,
                content: {
                  rendered: comment
                },
                date_gmt: dateGmt,
                author
              }
            ];

            oldGet = request.get;
            sinon.stub(request, 'get', function onGet(options, callback) {
              callback(
                null,                     // error
                { statusCode: 200 },      // response
                JSON.stringify(response)  // body
              );
            });

            wordpress.pull(metadata, state, res);
          });

          afterEach(function after() {
            request.get = oldGet;
          });

          it('returns transformed results', function transformedResults() {
            var expected = {
              external_resources: [
                {
                  author: {
                    external_id: author,
                    name: 'Anonymous'
                  },
                  created_at: '2016-07-06T20:03:29.000Z',
                  external_id: `${post}:${id}:${link}`,
                  message: strippedComment,
                  parent_id: `${post}:${parent}:${link}`
                }
              ],
              state: `{"most_recent_item_timestamp":"${dateGmt}"}`
            };

            assert.equal(200, res.statusCode);
            assert.deepEqual(expected, res._getData());
          });
        });
      });

      describe('no comments', function parseableResponse() {
        describe('empty state', function emptyState() {
          beforeEach(function before() {
            oldGet = request.get;
            sinon.stub(request, 'get', function onGet(options, callback) {
              callback(
                null,                     // error
                { statusCode: 200 },      // response
                JSON.stringify([])        // body
              );
            });

            wordpress.pull(metadata, state, res);
          });

          afterEach(function after() {
            request.get = oldGet;
          });

          it('returns no results or state', function transformedResults() {
            var expected = {
              external_resources: [],
              state: '{}'
            };

            assert.equal(200, res.statusCode);
            assert.deepEqual(expected, res._getData());
          });
        });

        describe('non-empty state', function nonEmptyState() {
          beforeEach(function before() {
            state = { a: 'b' };
            oldGet = request.get;
            sinon.stub(request, 'get', function onGet(options, callback) {
              callback(
                null,                     // error
                { statusCode: 200 },      // response
                JSON.stringify([])        // body
              );
            });

            wordpress.pull(metadata, state, res);
          });

          afterEach(function after() {
            request.get = oldGet;
          });

          it('returns pre-existing state', function transformedResults() {
            var expected = {
              external_resources: [],
              state: '{"a":"b"}'
            };

            assert.equal(200, res.statusCode);
            assert.deepEqual(expected, res._getData());
          });
        });
      });

      describe('multiple comments', function multipleComments() {
        beforeEach(function before() {
          var response = [
            {
              link,
              id,
              parent,
              post,
              content: {
                rendered: comment
              },
              date_gmt: dateGmt,
              author,
              author_name: authorName
            },
            {
              link: 'test.com/link/2',
              id: '567',
              parent: '678',
              post: '789',
              content: {
                rendered: '<b>another rendered comment</b>'
              },
              date_gmt: '2016-07-06T20:03:30',
              author: '890',
              author_name: 'canyon'
            }
          ];

          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              null,                     // error
              { statusCode: 200 },      // response
              JSON.stringify(response)  // body
            );
          });

          wordpress.pull(metadata, state, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('returns state for last comment', function lastCommentState() {
          assert.equal(200, res.statusCode);
          assert.equal(
            '{"most_recent_item_timestamp":"2016-07-06T20:03:30"}',
            res._getData().state
          );
        });
      });

      describe('unparseable response', function unparseableResponse() {
        beforeEach(function before() {
          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              null,                     // error
              { statusCode: 200 },      // response
              'some garbage'            // body
            );
          });

          wordpress.pull(metadata, state, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('returns error', function errors() {
          assert.equal(502, res.statusCode);
        });
      });
    });

    describe('request fails', function requestFails() {
      describe('http error', function httpError() {
        var errorBody = 'test body';

        beforeEach(function before() {
          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              null,                     // error
              { statusCode: 500 },      // response
              errorBody                 // body
            );
          });

          wordpress.pull(metadata, state, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('returns error code', function returnsError() {
          var expected = {
            error_info: errorBody
          };

          assert.equal(500, res.statusCode);
          assert.deepEqual(expected, res._getData());
        });
      });

      describe('non-http error', function nonHttpError() {
        beforeEach(function before() {
          oldGet = request.get;
          sinon.stub(request, 'get', function onGet(options, callback) {
            callback(
              {},       // error
              null,     // response
              null      // body
            );
          });

          wordpress.pull(metadata, state, res);
        });

        afterEach(function after() {
          request.get = oldGet;
        });

        it('returns 503', function returns503() {
          assert.equal(503, res.statusCode);
        });
      });
    });
  });

  describe('#channelback()', function testChannelback() {
    var author = '456';
    var login = 'agent';
    var password = '123456';
    var wordpressLocation = 'wordpress.com';
    var metadata = {
      author,
      login,
      password,
      wordpress_location: wordpressLocation
    };
    var link = 'test.com/link';
    var post = '234';
    var parentId = '345';
    var parent = `${post}:${parentId}:${link}`;
    var channelbackContent = 'channelback';
    var oldPost;

    describe('request succeeds', function requestSucceeds() {
      var id = '123';

      beforeEach(function before() {
        var response = { id };
        var expectedRequest = {
          auth: {
            pass: password,
            user: login
          },
          qs: {
            author,
            content: channelbackContent,
            parent: parentId,
            post
          },
          uri: `${wordpressLocation}/wp-json/wp/v2/comments`
        };

        oldPost = request.get;
        sinon.stub(request, 'post', function onPost(options, callback) {
          assert.deepEqual(expectedRequest, options);

          callback(
            null,                     // error
            { statusCode: 201 },      // response
            JSON.stringify(response)  // body
          );
        });

        wordpress.channelback(metadata, parent, channelbackContent, res);
      });

      afterEach(function after() {
        request.post = oldPost;
      });

      it('returns info about comment', function returnsComment() {
        var expected = {
          external_id: `${post}:${id}:${link}`
        };

        assert.equal(200, res.statusCode);
        assert.deepEqual(expected, res._getData());
      });
    });

    describe('request fails', function requestFails() {
      describe('status is not 201', function statusNot201() {
        var response = 'test response';
        var responseCode = 203;

        beforeEach(function before() {
          oldPost = request.get;
          sinon.stub(request, 'post', function onPost(options, callback) {
            callback(
              null,                           // error
              { statusCode: responseCode },   // response
              response                        // body
            );
          });

          wordpress.channelback(metadata, parent, 'channelback', res);
        });

        afterEach(function after() {
          request.post = oldPost;
        });

        it('returns status', function returnsStatus() {
          var expected = {
            error_info: response
          };

          assert.equal(responseCode, res.statusCode);
          assert.deepEqual(expected, res._getData());
        });
      });

      describe('non-http error', function nonHttpError() {
        beforeEach(function before() {
          oldPost = request.get;
          sinon.stub(request, 'post', function onPost(options, callback) {
            callback(
              {},     // error
              null,   // response
              null    // body
            );
          });

          wordpress.channelback(metadata, parent, 'channelback', res);
        });

        afterEach(function after() {
          request.post = oldPost;
        });

        it('returns 503', function returnsStatus() {
          assert.equal(503, res.statusCode);
        });
      });
    });
  });

  describe('#clickthrough()', function testClickthrough() {
    it('redirects to Wordpress', function redirects() {
      var link = 'test.com/link';
      var post = '234';
      var parentId = '345';
      var externalId = `${post}:${parentId}:${link}`;

      wordpress.clickthrough(externalId, res);
      assert.equal(302, res.statusCode);
      assert.equal(link, res._getRedirectUrl());
    });
  });

  describe('#healthcheck()', function testHealthcheck() {
    it('returns 200', function returns200() {
      wordpress.healthcheck(res);
      assert.equal(200, res.statusCode);
    });
  });

  describe('#eventCallback()', function testEventCallback() {
    it('returns 200', function returns200() {
      wordpress.eventCallback('test info', res);
      assert.equal(200, res.statusCode);
    });

    it('logs body', function logsBody() {
      var logger = sinon.spy(console, 'log')
      wordpress.eventCallback('test info', res);
      assert(logger.calledWith('Event callback:'));
      assert(logger.calledWith('test info'));
    });
  });
});

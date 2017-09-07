require('dotenv-extended').load();

const builder = require('botbuilder');
const restify = require('restify');
const mysql = require('mysql');
const http = require('http');
const https = require('https');
const fs = require('fs');
const util = require('util');
const request = require('request');
const cheerio = require('cheerio');
const url = require('url');
const path = require('path');
const Vision = require('@google-cloud/vision');
const gm = require('gm').subClass({imageMagick: true});
const vision = require('node-cloud-vision-api');
const dialogue = require('./dialogue');
const utils = require('./utils');
const constants = require('./constants');

// Create our intial MySQL connection
var mysql_connection = mysql.createConnection({
  host: constants.HOST,
  user: constants.USER,
  password: constants.PASSWORD,
  database: constants.DATABASE
});

// Initialise the Google Vision API
vision.init({auth: constants.VISION_AUTH})

// Google Cloud Platform project ID
const projectId = constants.CLOUD_PLATFORM_ID;

// Instantiates a client
const visionClient = Vision({
  projectId: projectId
});

// Setup Restify Server
var server = restify.createServer();
server.listen(constants.PORT, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: constants.MICROSOFT_APP_ID,
    appPassword: constants.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);

// Start listening on the server at this URL
server.post('/api/messages', connector.listen());

// Our Microsoft LUIS API URL
const LuisModelUrl = constants.LUIS_MODEL_URL;

// We use this temp object to store requested credentials
// TODO: Move this into session based variables
let client = { name: "", domain: "", username: "", password: "" };

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);

// Set up our intents. Read more about them on LUIS
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
    .matches('Access.Details', [
        function(session, args, next) {
          var entities = args.entities;
          var entity = builder.EntityRecognizer.findEntity(entities, 'client');

          builder.Prompts.text(session, "No problem at all.. what is the client or company name?");
        },
        function (session, results) {
          var company = results.response.toLowerCase();

          // Looking
          session.send("Give me 2 seconds...Just busy searching for '"+company+"'....");

          // Connect to MySQL
          mysql_connection.connect(function(err) {
            mysql_connection.query('SELECT * FROM store WHERE name LIKE "%'+company+'%"', function(err, results) {
              if (results.length==0) {
                session.send("Shucks, sorry - there's nothing. List all the companies by asking me to 'list all companies'");
              } else {
                session.endDialog('Found it! Go and log in at '+results[0].domain+', username: '+results[0].username+' & password: '+results[0].password);
              }
            })
          })
        }
    ])
    .matches('Access.List', [
      function(session, args, next) {
        var clients = [];

        // Connect to MySQL
        mysql_connection.connect(function(err) {
          mysql_connection.query('SELECT * FROM store', function(err, results) {
            if (results.length==0) {
              session.send("Hmmmm.... sorry, I have nothing. Add one by asking me to 'add a client'.");
            } else {
              for (var i = 0; i < results.length; i++) {
                clients.push(results[i].name);
              }

              session.send("Here is a list all your clients... "+ clients.join(', '));
            }
          })
        })
      }
    ])
    .matches('Request', [
        function(session, args, next) {
            builder.Prompts.text(session, "No problem! What is the name of the client?");
        },
        function (session, results) {
            if (results.response.toLowerCase()=="stop") {
              session.endDialog("Phew... that was close hey!");
            } else {
              client.name = results.response.toLowerCase();
              builder.Prompts.text(session, "What is the URL for "+results.response);
            }
        },
        function (session, results) {
          if (results.response.toLowerCase()=="stop") {
            session.endDialog("Phew... that was close!");
          } else {
            client.domain = results.response;
            builder.Prompts.text(session, "What is the username for "+results.response);
          }
        },
        function (session, results) {
          if (results.response.toLowerCase()=="stop") {
            session.endDialog("Phew... that was close!");
          } else {
            client.username = results.response;
            builder.Prompts.text(session, "What is the password for "+results.response);
          }
        },
        function (session, results) {
          if (results.response.toLowerCase()=="stop") {
            session.endDialog("Phew... that was too close!");
          } else {
            client.password = results.response;

            // Connect to MySQL
            mysql_connection.connect(function(err) {
              mysql_connection.query('INSERT INTO store (name, domain, username, password) VALUES (\''+client.name+'\', \''+client.domain+'\', \''+client.username+'\', \''+client.password+'\')', function(err, results) {
                  session.endDialog("All done!");
              })
            });
          }
        }
      ])
    .matches('Read.This', [
      function (session) {
            builder.Prompts.attachment(session, "Sounds good! Attach an image and I'll try!");
      },
      function (session, results) {
          session.send("Got it! Give me 2 seconds.. I'm just putting on my reading glasses...")

          if (results && results.response) {
              results.response.forEach(function (attachment) {

                var file = fs.createWriteStream("file.jpg");
                var httpsRequest = http.get(attachment.contentUrl, function(response) {
                  var stream = response.pipe(file);

                  stream.on('finish', function () {
                    const req = new vision.Request({
                      image: new vision.Image("./file.jpg"),
                      features: [
                        new vision.Feature('FACE_DETECTION', 4),
                        new vision.Feature('LABEL_DETECTION', 10),
                        new vision.Feature('TEXT_DETECTION', 5)
                      ]
                    })

                    // send single request
                    vision.annotate(req).then((res) => {
                      var annotations = []

                      res.responses[0].labelAnnotations.forEach(function (value) {
                        annotations.push(value.description);
                      })

                      // handling response
                      if (res.responses[0].textAnnotations!=undefined) {
                        if (res.responses[0].textAnnotations[0].description!=undefined) {
                          session.endDialog("I can read the following text... "+res.responses[0].textAnnotations[0].description);
                        }
                        if (res.responses[0].textAnnotations.fullTextAnnotation!=undefined) {
                          session.endDialog("I can read the following text... "+res.responses[0].textAnnotations.fullTextAnnotation.text);
                        }
                      }
                    }, (e) => {
                      console.log('Error: ', e)
                    })
                  });
                });
              });
          } else {
              session.endDialog("You cancelled.");
          }
      }])
    .matches('Buy.This', [
        function (session) {
              builder.Prompts.attachment(session, "Awesome! Take a pic of what you're looking for....");
        },
        function (session, results) {
            session.send("Got it! Give me 2 seconds.. I'm just busy looking...")

            if (results && results.response) {
                results.response.forEach(function (attachment) {

                  var file = fs.createWriteStream("file.jpg");
                  var httpsRequest = http.get(attachment.contentUrl, function(response) {
                    var stream = response.pipe(file);

                    stream.on('finish', function () {
                      const req = new vision.Request({
                        image: new vision.Image("./file.jpg"),
                        features: [
                          new vision.Feature('FACE_DETECTION', 4),
                          new vision.Feature('LABEL_DETECTION', 10),
                          new vision.Feature('TEXT_DETECTION', 5)
                        ]
                      })

                      // send single request
                      vision.annotate(req).then((res) => {
                        var annotations = []

                        res.responses[0].labelAnnotations.forEach(function (value) {
                          annotations.push(value.description);
                        })

                        // Get the products
                        var url = 'https://www.amazon.co.uk/s/ref=nb_sb_noss/257-9141857-9745700?url=search-alias%3Daps&field-keywords='+annotations.join('+');

                        request(url, function(error, response, html) {
                            if (!error && response.statusCode == 200) {
                                var $ = cheerio.load(html);
                                var products = [];
                                var count = 0;

                                if ($('li.s-result-item').length==0) {
                                    session.endDialog("Sorry, I didn't find anything! :(");
                                } else {
                                    $('li.s-result-item').each(function() {
                                      var item = $(this);
                                      var img = item.find('img.s-access-image').attr('src');
                                      var h2 = item.find('h2.s-access-title').text();
                                      var price = item.find('span.s-price').text();
                                      var a = item.find('a-link-normal').text();

                                      count++

                                      if (count<=4) {
                                        products.push({
                                            title: h2,
                                            text: price,
                                            image: img,
                                        });
                                      }
                                    });

                                    var message = new builder.Message()
                                      .attachmentLayout(builder.AttachmentLayout.carousel)
                                      .attachments(products.map(utils.productAsAttachment));

                                    session.send("Here you go...");
                                    session.send(message);
                                }
                            }
                        });

                      }, (e) => {
                        console.log('Error: ', e)
                      })
                    });
                  });
                });
            } else {
                session.endDialog("You cancelled.");
            }
        }])
    .matches('What.This', [
        function (session) {
              builder.Prompts.attachment(session, "No problem! Attach an image and I'll try my best!");
        },
        function (session, results) {
            session.send("Got it! Give me 2 seconds.. I'm just busy analyzing...")

            if (results && results.response) {
                results.response.forEach(function (attachment) {

                  var file = fs.createWriteStream("file.jpg");
                  var httpsRequest = http.get(attachment.contentUrl, function(response) {
                    var stream = response.pipe(file);

                    stream.on('finish', function () {
                      const req = new vision.Request({
                        image: new vision.Image("./file.jpg"),
                        features: [
                          new vision.Feature('FACE_DETECTION', 4),
                          new vision.Feature('LABEL_DETECTION', 10),
                          new vision.Feature('TEXT_DETECTION', 5)
                        ]
                      })

                      // send single request
                      vision.annotate(req).then((res) => {
                        var annotations = []

                        res.responses[0].labelAnnotations.forEach(function (value) {
                          annotations.push(value.description);
                        })

                        session.endDialog("Okay! So I can see the following things... "+ annotations.join(', '))
                      }, (e) => {
                        console.log('Error: ', e)
                      })
                    });
                  });
                });
            } else {
                session.endDialog("You cancelled.");
            }
        }])
    .matches('Warren.Joke', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.jokes));
      }])
    .matches('Greeting.Cheer', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.cheer));
      }])
    .matches('Greeting.Hi', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.hi));
      }])
    .matches('Help', [
      function(session, args, next) {
        session.endDialog('Try asking me to read something, tell you a joke, buy something... word it like \"Buy this!\" (and then I\'ll ask you for an image).');
      }])
    .matches('Greeting.Fine', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.fine));
      }])
    .matches('Greeting.Care', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.care));
      }])
    .matches('Greeting.What', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.what));
      }])
    .matches('Greeting.Sorry', [
      function(session, args, next) {
        session.endDialog(utils.getRandomEntryFor(dialogue.sorry));
      }])
    .onDefault((session) => {
      session.endDialog(utils.getRandomEntryFor(dialogue.magicAnswers));
    });

bot.dialog('/', intents);

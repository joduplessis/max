var builder = require('botbuilder');

module.exports = {
  attachmentCreator: (image, type="image/jpeg") => {
       return msg = new builder.Message(session)
         .attachments([{
             contentType: type,
             contentUrl: image
         }]);
  },

  // Hero card with images, etc.
  heroCardCreator: (title, text, session, image) => {
    var card = new builder.HeroCard(session)
                        .title(title)
                        .text(text)
                        .images([
                          builder.CardImage.create(session, image)
                        ]);

    return new builder.Message(session).attachments([card]);
  },

  // Thumbnail card
  productAsAttachment: (product) => {
      return new builder.ThumbnailCard()
          .title(product.title)
          .text(product.text)
          .images([new builder.CardImage().url(product.image)]);
  },

  // Extract a random entry from the array
  getRandomEntryFor: (array) => {
    var random = Math.random();
    var max = array.length;
    var entry = array[Math.round(random * max)];

    if (entry==undefined) {
      return array[0];
    } else {
      return entry;
    }
  },

  // This is the code for sending to a Slack user
  slackMentionUser: (user, session, args) => {
      var entities = args.entities;
      var entity = builder.EntityRecognizer.findEntity(entities, 'client');
      var warrenkilian = user;
      let testAddress = {
          channelId: 'slack',
          user: session.message.address.user,
          conversation: session.message.address.conversation,
          bot: session.message.address.bot,
          serviceUrl: 'https://slack.botframework.com',
          useAuth: true
      }

      // Add the mention so they get notified
      return mention = new builder.Message(session)
          .text(`<@${`+user+`}> `+joke)
          .address(testAddress);
  }
};

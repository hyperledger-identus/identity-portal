db.createUser({
  user: "admin",
  pwd: "admin",
  roles: [{ role: "readWrite", db: "mediator" }],
});

const database = "mediator";
const collectionDidAccount = "user.account";
const collectionMessages = "messages";
const collectionMessagesSend = "messages.outbound";

db = db.getSiblingDB(database);

db.createCollection(collectionDidAccount);
db.createCollection(collectionMessages);
db.createCollection(collectionMessagesSend);

db.getCollection(collectionDidAccount).createIndex({ did: 1 }, { unique: true });
db.getCollection(collectionDidAccount).createIndex(
  { alias: 1 },
  { unique: true, partialFilterExpression: { "alias.0": { $exists: true } } },
);
db.getCollection(collectionDidAccount).createIndex({
  "messagesRef.hash": 1,
  "messagesRef.recipient": 1,
});

db.getCollection(collectionMessages).createIndex(
  { ts: 1 },
  {
    name: "message-ttl-index",
    partialFilterExpression: { message_type: "Mediator" },
    expireAfterSeconds: 7 * 24 * 60 * 60,
  },
);

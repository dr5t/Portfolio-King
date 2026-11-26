const mongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

// Connect to the db
let _db = null;
const mongoConnect = callback => {
    mongoClient.connect("mongodb://127.0.0.1:27017/portfolio", { useNewUrlParser: true, useUnifiedTopology: true })
        .then(client => {
            _db = client.db();
            callback();
        })
        .catch(err => {
            console.log(err);
        });
}

const getDb = () => {
    if (_db) return _db;
    throw 'No db connected'
}

module.exports.mongoConnect = mongoConnect;
module.exports.getDb = getDb;
module.exports.ObjectID = ObjectID;

require('dotenv').config();
const mongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

let _db = null;
const mongoConnect = callback => {
    const mongoUrl = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/portfolio";
    const dbName = process.env.DB_NAME || 'portfolio';
    mongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(client => {
            _db = (client.s && client.s.options && client.s.options.dbName) ? client.db() : client.db(dbName);
            callback();
        })
        .catch(err => {
            console.error('MongoDB connection error:', err);
        });
};

const getDb = () => {
    if (_db) return _db;
    throw 'No db connected'
}

module.exports.mongoConnect = mongoConnect;
module.exports.getDb = getDb;
module.exports.ObjectID = ObjectID;

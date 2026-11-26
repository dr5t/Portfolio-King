require('dotenv').config();
const mongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

let _db = null;
const mongoConnect = async callback => {
    const mongoUrl = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/portfolio";
    const dbName = process.env.DB_NAME || 'portfolio';
    try {
        const client = await mongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        _db = (client.s && client.s.options && client.s.options.dbName) ? client.db() : client.db(dbName);
        _db.collection('teams').createIndex({ teamId: 1 }, { unique: true, sparse: true }).catch(() => {});
        _db.collection('teams').createIndex({ gameId: 1 }).catch(() => {});
        _db.collection('games').createIndex({ timestamp: -1 }).catch(() => {});
        await callback();
    } catch (err) {
        console.error('MongoDB connection error:', err && err.message ? err.message : 'Database connection failed');
        throw err;
    }
};

const getDb = () => {
    if (_db) return _db;
    throw new Error('Database not connected');
}

module.exports.mongoConnect = mongoConnect;
module.exports.getDb = getDb;
module.exports.ObjectID = ObjectID;

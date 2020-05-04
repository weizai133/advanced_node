const mongoose = require('mongoose');
const redis = require('redis');
const redisURL = "redis://127.0.0.1:6379";
const redisClient = redis.createClient(redisURL);
const util = require('util');
redisClient.get = util.promisify(redisClient.get);
redisClient.hget = util.promisify(redisClient.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options={}) {
    this._cache = true;
    this.hashkey = JSON.stringify(options.key || '');
    return this;
}

mongoose.Query.prototype.exec = async function () {
    if(!this._cache) return exec.apply(this, arguments);

    const key = JSON.stringify(Object.assign({}, this.getQuery, {collection : this.mongooseCollection.name}));

    const cacheValue = await redisClient.hget(this.hashkey, key);

    if(cacheValue){
        console.log("FROM caching");
        const res = JSON.parse(cacheValue);
        return Array.isArray(res) 
                ? res.map(val => this.model(val)) 
                : this.model(res)
    }

    console.log("FROM Mongo");
    const result = await exec.apply(this, arguments);
    redisClient.hset(this.hashkey, key, JSON.stringify(result));

    return result;

}

module.exports = {
    clearCache : function (hashkey) {
        redisClient.del(JSON.stringify(hashkey));
    }
}

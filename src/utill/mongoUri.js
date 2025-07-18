require("dotenv").config();

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const MONGO_DATABASE = process.env.MONGO_DATABASE;

const generateMongoUri = (database = MONGO_DATABASE) => {
  return `mongodb://${MONGO_HOST}:${MONGO_PORT}/${database}?directConnection=true&replicaSet=rs0`;
};

module.exports = generateMongoUri;

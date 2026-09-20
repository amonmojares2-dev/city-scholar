const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGO_URI;
console.log('URI_SET', Boolean(uri));

if (!uri) {
  console.log('MISSING_MONGO_URI');
  process.exit(1);
}

mongoose.set('bufferCommands', false);

mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  .then((conn) => {
    console.log('CONNECTED', conn.connection.host);
    return mongoose.disconnect();
  })
  .catch((error) => {
    console.log('CONNECTION_FAILED', error.message);
    process.exit(1);
  });
const mongoose = require("mongoose");

mongoose.set("bufferCommands", false);

const connectDB = async() => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000
        });

        console.log(`MongoDB connected: ${conn.connection.host}`);
        return true;
    } catch (error) {
        console.error("MongoDB connection failed:");
        console.error(error.message);

        return false;
    }
};

module.exports = connectDB;
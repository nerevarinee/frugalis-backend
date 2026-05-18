import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";


import userRouter from "./parts/user.part.js";
import listingRouter from "./parts/listing.part.js";
import orderRouter from "./parts/orders.part.js";
import guestRouter from "./parts/guest.part.js";
import messageRouter from "./parts/message.part.js";

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestLogger);

app.use("/api/users", userRouter);
app.use("/api/listings", listingRouter);
app.use("/api/orders", orderRouter);
app.use("/api/guests", guestRouter);
app.use("/api/messages", messageRouter);

app.use(errorHandler);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${process.env.MONGO_URI}`);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

await connectDB();

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
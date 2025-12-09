import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import winston from "winston";
import compression from "compression";

import myListRoutes from "./routes/myList.route";
import { errorHandler } from "./middleware/errorHandler";
import { requireUser } from "./middleware/requireUser";
import logger from "./utils/logger";

// Initializes instance of express
const app = express();
app.use(express.json());
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
);

// apply middleware
app.use(helmet()); // basic security headers
app.use(cors({ origin: true })); // tighten origin in prod
app.use(compression()); // gzip responses

// requireUser for all mylist routes (simple auth stub)
// we can use JWT or other auth methods later - for now, just a header
app.use("/api/mylist", requireUser, myListRoutes);

// health
app.get("/health", (req, res) =>
  res.send({ status: "ok", timestamp: Date.now() }),
);

app.use(errorHandler);

export default app;

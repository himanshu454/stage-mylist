import app from "./app";
import connectDb from "./config/db";
import dotenv from "dotenv";
dotenv.config({ override: true });

const PORT = process.env.PORT || 4000;

async function start(): Promise<void> {
  try {
    await connectDb();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

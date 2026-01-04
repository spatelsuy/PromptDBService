import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();
const app = express();
app.use(helmet()); // Helmet for secure headers
app.set("trust proxy", 1);
// Rate limiter (basic protection)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // max requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS — secure allowed origins
const allowedOrigins = ("http://localhost:3000").split(",").map(o => o.trim());
console.log("Allowed origins:", allowedOrigins);
app.use(
  cors({
    origin: (origin, callback) => {
      console.log(" origins:", origin);
      // allow server-to-server or CLI (no origin)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked: Origin Not Allowed"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// JSON parser
app.use(express.json({ limit: "10kb" }));

// Import routes
import routes from "./routes/index.js";
app.use("/api", routes);

// Simple health check
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello, backend is connected successfully" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("Allowed origins:", allowedOrigins);
});









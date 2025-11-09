import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Import all routes
import routes from './routes/index.js';
// Use all routes with /api prefix
app.use('/api', routes);


// ✅ Only keep /api/hello in main file
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello, backend is connected successfully" });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));



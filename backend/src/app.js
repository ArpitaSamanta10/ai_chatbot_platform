import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import supabase from "./config/supabase.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

const app = express();

// CORS configuration to allow frontend requests
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

const chatLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 10,
  message: "Too many requests from this IP, please try again later.",
});

app.get("/", async (req, res) => {
  const { data, error } = await supabase.from("test").select("*");

  if (error) {
    return res.json({
      success: false,
      message: "Supabase error",
      error: error.message,
    });
  }

  res.json({
    success: true,
    data,
  });
});

app.use("/api/chat", chatLimiter, chatRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

export default app;

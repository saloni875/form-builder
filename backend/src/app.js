import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import session from "express-session";

const app = express();

app.use(session({
  secret: "supersecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: false,    // allow browser to send cookie
    secure: false,      // must be false on localhost
    sameSite: "lax",
    maxAge: 1000 * 60 * 60
  }
}));

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));



app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);

export default app;
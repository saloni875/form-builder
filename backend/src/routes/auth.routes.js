import express from "express";
import axios from "axios";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

/*  
===============================
   1. Airtable OAuth - START
===============================
*/
router.get("/airtable/start", (req, res) => {
  const base = "https://airtable.com/oauth2/v1/authorize";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.AIRTABLE_CLIENT_ID,
    redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
    scope: "data.records:read data.records:write data.bases:read"
  });

  return res.redirect(`${base}?${params.toString()}`);
});

/*  
===============================
   2. OAuth CALLBACK
===============================
*/
router.get("/airtable/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) return res.status(400).send("Missing authorization code");

  try {
    // Step 1 — Exchange code
    const tokenRes = await axios.post(
      "https://airtable.com/oauth2/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.AIRTABLE_CLIENT_ID,
        client_secret: process.env.AIRTABLE_CLIENT_SECRET,
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Step 2 — Fetch basic profile
    const basesRes = await axios.get("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const airtableUserId = basesRes.data?.bases?.[0]?.id || "airtable_user";

    // Step 3 — Save user
    const userData = {
      airtableUserId,
      profile: basesRes.data,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiry: new Date(Date.now() + expires_in * 1000),
      lastLoginAt: new Date()
    };

    let user = await User.findOneAndUpdate(
      { airtableUserId },
      userData,
      { new: true, upsert: true }
    );

    // Step 4 — Create JWT
    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Step 5 — Set cookie & redirect
    res.cookie("token", authToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax"
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.log("OAuth Error:", err.response?.data || err.message);
    return res.status(500).send("OAuth callback failed");
  }
});

export default router;

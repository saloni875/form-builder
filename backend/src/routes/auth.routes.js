import express from "express";
import axios from "axios";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

const router = express.Router();

/*  
===============================
   1. Airtable OAuth - START
===============================
*/
router.get("/airtable/start", (req, res) => {
  const base = "https://airtable.com/oauth2/v1/authorize";

  // PKCE verifier
  const codeVerifier = crypto.randomBytes(64).toString("hex");
  req.session.codeVerifier = codeVerifier;

  // PKCE challenge (base64url)
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // State for CSRF protection
  const state = crypto.randomUUID();
  req.session.state = state;

  console.log("=== START ===");
  console.log("Generated state:", state);
  console.log("Generated codeVerifier length:", codeVerifier.length);
  console.log("Session at START (has state & codeVerifier):", {
    state: req.session.state ? "yes" : "no",
    codeVerifier: req.session.codeVerifier ? "yes" : "no",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.AIRTABLE_CLIENT_ID,
    redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
    scope:
      "data.records:read data.records:write data.recordComments:read schema.bases:read webhook:manage",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return res.redirect(`${base}?${params.toString()}`);
});

/*  
===============================
   2. OAuth CALLBACK
===============================
*/
router.get("/airtable/callback", async (req, res) => {
  try {
    // IMPORTANT: read query first
    const { code, state } = req.query;

    console.log("=== CALLBACK ===");
    console.log("Received state:", state);
    console.log("Received code (first 8 chars):", (code || "").slice(0, 8));
    console.log("Stored session.state:", req.session?.state ? "exists" : "missing");
    console.log("Stored session.codeVerifier length:", (req.session?.codeVerifier || "").length);

    // 1. Check state
    if (!state || state !== req.session.state) {
      console.log("Invalid state: session.state =", req.session.state);
      return res.status(400).send("Invalid state value");
    }

    // 2. Check PKCE
    const codeVerifier = req.session.codeVerifier;
    if (!codeVerifier) {
      console.log("Missing PKCE codeVerifier in session");
      return res.status(400).send("Missing PKCE code verifier");
    }

    // 3. Check code
    if (!code) {
      console.log("Missing authorization code in callback query");
      return res.status(400).send("Missing authorization code");
    }

    // Debug printing (masked secret)
    console.log("== DEBUG: OAuth token exchange data ==");
    console.log("client_id:", process.env.AIRTABLE_CLIENT_ID);
    const secret = process.env.AIRTABLE_CLIENT_SECRET || "";
    const masked = secret.length > 6 ? secret.slice(0, 3) + "..." + secret.slice(-3) : "****";
    console.log("client_secret (masked):", masked);
    console.log("redirect_uri:", process.env.AIRTABLE_REDIRECT_URI);
    console.log("code_verifier length:", codeVerifier.length);

    // 4. Exchange code for tokens
    const tokenRes = await axios.post(
      "https://airtable.com/oauth2/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.AIRTABLE_CLIENT_ID,
        client_secret: process.env.AIRTABLE_CLIENT_SECRET,
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    if (!access_token) throw new Error("no access_token returned from Airtable");

    // 5. Fetch user base meta
    const basesRes = await axios.get("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const airtableUserId = basesRes.data?.bases?.[0]?.id || "airtable_user";

    // 6. Save user in DB
    const userData = {
      airtableUserId,
      profile: basesRes.data,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiry: new Date(Date.now() + expires_in * 1000),
      lastLoginAt: new Date(),
    };

    let user = await User.findOneAndUpdate(
      { airtableUserId },
      userData,
      { new: true, upsert: true }
    );

    // 7. Create JWT
    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 8. Clear session entries we used
    delete req.session.state;
    delete req.session.codeVerifier;

    // 9. Set cookie & redirect to frontend
    res.cookie("token", authToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    // Diagnostic logging - show Airtable response if present
    console.log("OAuth Error:", err.response?.data || err.message);
    return res.status(500).send("OAuth callback failed");
  }
});

export default router;





// import express from "express";
// import axios from "axios";
// import User from "../models/User.js";
// import jwt from "jsonwebtoken";
// import dotenv from "dotenv";
// import crypto from "crypto";
// dotenv.config();

// const router = express.Router();

// /*  
// ===============================
//    1. Airtable OAuth - START
// ===============================
// */
// router.get("/airtable/start", (req, res) => {
//   const base = "https://airtable.com/oauth2/v1/authorize";

//   // PKCE verifier
//   const codeVerifier = crypto.randomBytes(64).toString("hex");
//   req.session.codeVerifier = codeVerifier;

//   // PKCE challenge
//   const codeChallenge = crypto
//     .createHash("sha256")
//     .update(codeVerifier)
//     .digest("base64")
//     .replace(/\+/g, "-")
//     .replace(/\//g, "_")
//     .replace(/=+$/, "");

//   // State for CSRF protection
//   const state = crypto.randomUUID();
//   req.session.state = state;

//   console.log("=== START ===");
// console.log("Generated state:", state);
// console.log("Generated codeVerifier:", codeVerifier);
// console.log("Session at START:", req.session);


//   const params = new URLSearchParams({
//     response_type: "code",
//     client_id: process.env.AIRTABLE_CLIENT_ID,
//     redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
//     scope:
//       "data.records:read data.records:write data.recordComments:read schema.bases:read webhook:manage",
//     state,
//     code_challenge: codeChallenge,
//     code_challenge_method: "S256",
//   });

//   return res.redirect(`${base}?${params.toString()}`);
// });

// /*  
// ===============================
//    2. OAuth CALLBACK
// ===============================
// */
// router.get("/airtable/callback", async (req, res) => {
//   try {
//     console.log("=== CALLBACK ===");
// console.log("Received state:", state);
// console.log("Stored session.state:", req.session.state);
// console.log("Received code:", code);
// console.log("Stored session.codeVerifier:", req.session.codeVerifier);

//     const { code, state } = req.query;

//     // 1. Check state
//     if (!state || state !== req.session.state) {
//       return res.status(400).send("Invalid state value");
//     }

//     // 2. Check PKCE
//     const codeVerifier = req.session.codeVerifier;
//     if (!codeVerifier) {
//       return res.status(400).send("Missing PKCE code verifier");
//     }

//     // 3. Check code
//     if (!code) {
//       return res.status(400).send("Missing authorization code");
//     }


//     console.log("== DEBUG: OAuth token exchange data ==");
//     console.log("client_id:", process.env.AIRTABLE_CLIENT_ID);
//     console.log("client_id length:", (process.env.AIRTABLE_CLIENT_ID || "").length);
//     const secret = process.env.AIRTABLE_CLIENT_SECRET || "";
//     const masked = secret.length > 6 ? secret.slice(0, 3) + "..." + secret.slice(-3) : "****";
//     console.log("client_secret (masked):", masked);
//     console.log("client_secret length:", secret.length);
//     console.log("redirect_uri:", process.env.AIRTABLE_REDIRECT_URI);
//     console.log("code (first 8 chars):", (code || "").slice(0, 8));
//     console.log("code_verifier length:", (req.session.codeVerifier || "").length);


//     // 4. Exchange code for tokens
//     const tokenRes = await axios.post(
//       "https://airtable.com/oauth2/v1/token",
//       new URLSearchParams({
//         grant_type: "authorization_code",
//         code,
//         client_id: process.env.AIRTABLE_CLIENT_ID,
//         client_secret: process.env.AIRTABLE_CLIENT_SECRET,
//         redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
//         code_verifier: codeVerifier,
//       }),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     const { access_token, refresh_token, expires_in } = tokenRes.data;

//     // 5. Fetch user base meta
//     const basesRes = await axios.get("https://api.airtable.com/v0/meta/bases", {
//       headers: { Authorization: `Bearer ${access_token}` },
//     });

//     const airtableUserId = basesRes.data?.bases?.[0]?.id || "airtable_user";

//     // 6. Save user in DB
//     const userData = {
//       airtableUserId,
//       profile: basesRes.data,
//       accessToken: access_token,
//       refreshToken: refresh_token,
//       tokenExpiry: new Date(Date.now() + expires_in * 1000),
//       lastLoginAt: new Date(),
//     };

//     let user = await User.findOneAndUpdate(
//       { airtableUserId },
//       userData,
//       { new: true, upsert: true }
//     );

//     // 7. Create JWT
//     const authToken = jwt.sign(
//       { userId: user._id },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     // 8. Clear session
//     delete req.session.state;
//     delete req.session.codeVerifier;

//     // 9. Set cookie & redirect
//     res.cookie("token", authToken, {
//       httpOnly: true,
//       secure: false,
//       sameSite: "lax",
//     });

//     return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
//   } catch (err) {
//     console.log("OAuth Error:", err.response?.data || err.message);
//     return res.status(500).send("OAuth callback failed");
//   }
// });

// export default router;






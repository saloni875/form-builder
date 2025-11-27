import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    airtableUserId: {
        type: String,
        required: true,
        unique: true
    },
    profile: Object,
    accessToken: String,
    refreshToken: String,
    tokenExpiry: Date,
    lastLoginAt: Date,
}, { timestamps: true });

export default mongoose.model("User", UserSchema);

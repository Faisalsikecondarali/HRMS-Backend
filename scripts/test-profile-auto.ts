import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/database";
import { User } from "../models/User";
import { Profile } from "../models/Profile";

async function main() {
  await connectDB();

  // Create a unique email each run
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `test.user.${suffix}@example.com`;

  try {
    const user = new User({
      name: "Test User",
      email,
      password: "password123",
      role: "staff",
    });
    await user.save();

    // Wait briefly to allow post-save hook to create profile
    await new Promise((r) => setTimeout(r, 200));

    const profile = await Profile.findOne({ user: user._id });
    if (!profile) {
      console.error("❌ Profile was not created for the new user");
      process.exitCode = 1;
      return;
    }

    console.log("✅ Profile created successfully for user:", user.email);
    console.log("Avatar URL:", profile.avatarUrl);

    // Cleanup: remove test user and profile
    await Profile.deleteOne({ _id: profile._id });
    await User.deleteOne({ _id: user._id });
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

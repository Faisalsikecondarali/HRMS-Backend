import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/database";
import { User } from "../models/User";
import { Profile } from "../models/Profile";

async function main() {
  await connectDB();

  try {
    const users = await User.find({ isActive: true }).select("_id name email");

    let created = 0;
    for (const u of users) {
      const existing = await Profile.findOne({ user: u._id });
      if (existing) continue;

      const seed = encodeURIComponent(u.name || u.email || String(u._id));
      // Use random style from a small set for variety
      const styles = [
        (s: string) => `https://api.dicebear.com/7.x/initials/svg?seed=${s}`,
        (s: string) => `https://api.dicebear.com/7.x/shapes/svg?seed=${s}`,
        (s: string) => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${s}`,
      ];
      const style = styles[Math.floor(Math.random() * styles.length)];
      const avatarUrl = style(seed);

      await Profile.create({ user: u._id, avatarUrl, isComplete: true });
      created += 1;
    }

    console.log(`Backfill complete. Profiles created: ${created}`);
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

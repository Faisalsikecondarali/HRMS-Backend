import { Router } from "express";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { Profile } from "../models/Profile";
import { upload, uploadToCloudinary } from "../utils/upload";
import fs from "fs/promises";
import path from "path";

const router = Router();
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || "uploads");

// Get my profile
router.get(
  "/me",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const profile = await Profile.findOne({ user: req.user!.userId });
      return res.json({ profile });
    } catch (err) {
      console.error("Get my profile error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Admin: get a user's profile
router.get(
  "/:userId",
  authenticateToken,
  requireRole(["admin"]),
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const profile = await Profile.findOne({ user: userId });
      return res.json({ profile });
    } catch (err) {
      console.error("Get user profile error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Admin: set a user's avatar (upload file or set by URL)
router.post(
  "/:userId/avatar",
  authenticateToken,
  requireRole(["admin"]),
  upload.single("avatar"),
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params as { userId: string };
      let avatarUrl = req.body.avatarUrl as string | undefined;

      if (req.file) {
        const uploaded = await uploadToCloudinary(req.file, {
          folder: "attendance-system/avatars",
          resource_type: "image",
        });
        avatarUrl = uploaded.secureUrl;
      }

      if (!avatarUrl) {
        return res.status(400).json({ message: "avatar file or avatarUrl is required" });
      }
      // delete old avatar file if it exists and is stored locally
      const existing = await Profile.findOne({ user: userId });
      if (existing?.avatarUrl) {
        const idx = existing.avatarUrl.indexOf("/uploads/");
        if (idx !== -1) {
          const filename = existing.avatarUrl.slice(idx + "/uploads/".length);
          const filePath = path.join(uploadsDir, filename);
          try {
            await fs.unlink(filePath);
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              console.warn("Failed to delete old avatar file", err);
            }
          }
        }
      }

      const profile = await Profile.findOneAndUpdate(
        { user: userId },
        { avatarUrl, isComplete: true },
        { new: true, upsert: true }
      );

      return res.json({ message: "Avatar updated", profile });
    } catch (err) {
      console.error("Admin set avatar error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// Admin: upload CNIC and CV documents
router.post(
  "/:userId/documents",
  authenticateToken,
  requireRole(["admin"]),
  upload.fields([
    { name: "cnic", maxCount: 1 },
    { name: "cv", maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const files = req.files as Record<string, Express.Multer.File[]>;
      const update: Partial<any> = {};
      if (files?.cnic?.[0]) {
        const uploaded = await uploadToCloudinary(files.cnic[0], {
          folder: "attendance-system/documents",
          resource_type: "image",
        });
        update.cnicImageUrl = uploaded.secureUrl;
      }
      if (files?.cv?.[0]) {
        const uploaded = await uploadToCloudinary(files.cv[0], {
          folder: "attendance-system/documents",
          resource_type: "auto",
        });
        update.cvUrl = uploaded.secureUrl;
      }
      if (!update.cnicImageUrl && !update.cvUrl) {
        return res.status(400).json({ message: "CNIC or CV file is required" });
      }

      const profile = await Profile.findOneAndUpdate(
        { user: userId },
        { ...update, isComplete: true },
        { new: true, upsert: true }
      );

      return res.json({ message: "Documents uploaded", profile });
    } catch (err) {
      console.error("Upload documents error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// User: update own avatar
router.patch(
  "/me/avatar",
  authenticateToken,
  upload.single("avatar"),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      let avatarUrl = req.body.avatarUrl as string | undefined;

      if (req.file) {
        avatarUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
      }

      if (!avatarUrl) {
        return res.status(400).json({ message: "avatar file or avatarUrl is required" });
      }
      // delete old avatar file if it exists and is stored locally
      const existing = await Profile.findOne({ user: userId });
      if (existing?.avatarUrl) {
        const idx = existing.avatarUrl.indexOf("/uploads/");
        if (idx !== -1) {
          const filename = existing.avatarUrl.slice(idx + "/uploads/".length);
          const filePath = path.resolve("uploads", filename);
          try {
            await fs.unlink(filePath);
          } catch (err: any) {
            if (err?.code !== "ENOENT") {
              console.warn("Failed to delete old avatar file", err);
            }
          }
        }
      }

      const profile = await Profile.findOneAndUpdate(
        { user: userId },
        { avatarUrl, isComplete: true },
        { new: true, upsert: true }
      );

      return res.json({ message: "Avatar updated", profile });
    } catch (err) {
      console.error("User update avatar error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;

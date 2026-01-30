import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export async function uploadToCloudinary(
  file: Express.Multer.File,
  options?: {
    folder?: string;
    resource_type?: "image" | "raw" | "video" | "auto";
    public_id?: string;
  }
): Promise<{ secureUrl: string; publicId: string; resourceType: string }> {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL is not configured");
  }

  const resourceType: "image" | "raw" | "video" | "auto" =
    options?.resource_type ?? (file.mimetype.startsWith("image/") ? "image" : "auto");

  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options?.folder,
        resource_type: resourceType,
        public_id: options?.public_id,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
        });
      }
    );

    stream.end(file.buffer);
  });
}

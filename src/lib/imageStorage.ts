import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";

// Uploaded images for the Email Builder live in one public Supabase Storage
// bucket. Public because email clients fetch <img> sources anonymously -
// there's no way to hand them a signed URL. The bucket is created on first
// use (like the default newsletter, §4.7), so there's no dashboard setup step.

const BUCKET = "newsletter-images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

let bucketReady = false;

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;

  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) {
    bucketReady = true;
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
  });

  // A concurrent request may have created it first - that's fine.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(
      `Couldn't create the image storage bucket ("${BUCKET}"). Create a public ` +
        `bucket with that name in the Supabase dashboard, then try again. (${error.message})`
    );
  }

  bucketReady = true;
}

export type UploadResult = { url: string };

export async function uploadImage(bytes: ArrayBuffer, contentType: string): Promise<UploadResult> {
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    throw new Error("Unsupported image type.");
  }

  await ensureBucket();

  const path = `${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

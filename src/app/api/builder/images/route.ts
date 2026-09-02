import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  uploadImage,
} from "@/lib/imageStorage";

// Admin-gated (proxy.ts covers /api/builder/*). Takes one image file as
// multipart/form-data under "file", stores it, and returns its public URL
// for the Builder to drop into a section as an <img> tag.
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return NextResponse.json(
      { error: "Use a PNG, JPEG, GIF, or WebP image." },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` },
      { status: 400 }
    );
  }

  try {
    const { url } = await uploadImage(await file.arrayBuffer(), file.type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}

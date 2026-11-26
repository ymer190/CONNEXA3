import type { MessageAttachment } from "@/types/conversations";

/**
 * Builds temporary browser previews only. This adapter does not upload files.
 * Replace it with the approved private-storage flow after backend/security review.
 */
export const attachmentService = {
  prepare(files: FileList | File[]): MessageAttachment[] {
    return Array.from(files).map((file) => ({
      id: "local-" + crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      localPreviewUrl: file.type.startsWith("image/") || file.type.startsWith("audio/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
  },
};

import type { MessageAttachment } from "@/types/conversations";

type AttachmentCardProps = {
  attachment: MessageAttachment;
};

export function AttachmentCard({ attachment }: AttachmentCardProps) {
  if (attachment.mimeType.startsWith("image/") && attachment.localPreviewUrl) {
    return (
      <figure className="cx-attachment cx-attachment-image">
        {/* Local object URL is created by the mock adapter and never uploaded. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.localPreviewUrl} alt={attachment.name} />
        <figcaption>{attachment.name}</figcaption>
      </figure>
    );
  }

  if (attachment.mimeType.startsWith("audio/") && attachment.localPreviewUrl) {
    return <div className="cx-attachment cx-attachment-audio"><span aria-hidden="true">♫</span><div><strong>{attachment.name}</strong><audio controls src={attachment.localPreviewUrl}>Seu navegador não reproduz este áudio.</audio></div></div>;
  }

  return (
    <div className="cx-attachment cx-attachment-file">
      <span className="cx-file-icon" aria-hidden="true">{attachment.mimeType === "application/pdf" ? "PDF" : "DOC"}</span>
      <span><strong>{attachment.name}</strong><small>{formatBytes(attachment.sizeBytes)}</small></span>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
  return (size / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
}

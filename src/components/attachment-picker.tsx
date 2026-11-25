"use client";

import { useRef, useState } from "react";
import styles from "./attachment-picker.module.css";

type AttachmentCategory = "image" | "audio" | "video" | "document";

type AttachmentPickerProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
};

const MAX_SIZE_MB: Record<AttachmentCategory, number> = {
  image: 15,
  audio: 25,
  video: 100,
  document: 50,
};

const MIME_TYPES: Record<AttachmentCategory, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg", "audio/webm"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  document: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

const ACCEPTED_MIME_TYPES = Object.values(MIME_TYPES).flat().join(",");

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

function getCategory(file: File): AttachmentCategory | null {
  return (Object.entries(MIME_TYPES) as [AttachmentCategory, string[]][]).find(([, types]) =>
    types.includes(file.type.toLowerCase()),
  )?.[0] ?? null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function isDuplicate(candidate: File, existing: File[]): boolean {
  return existing.some((file) =>
    file.name === candidate.name &&
    file.size === candidate.size &&
    file.lastModified === candidate.lastModified &&
    file.type === candidate.type,
  );
}

export function AttachmentPicker({ files, onFilesChange }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");

  function handleSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    const accepted: File[] = [];
    const errors: string[] = [];

    for (const file of selected) {
      const category = getCategory(file);

      if (!category) {
        errors.push(`${file.name}: formato não reconhecido nesta etapa.`);
        continue;
      }

      const maxBytes = MAX_SIZE_MB[category] * 1024 * 1024;
      if (file.size > maxBytes) {
        errors.push(`${file.name}: excede o limite de ${MAX_SIZE_MB[category]} MB para ${CATEGORY_LABELS[category].toLowerCase()}.`);
        continue;
      }

      if (file.size === 0) {
        errors.push(`${file.name}: o arquivo está vazio.`);
        continue;
      }

      if (isDuplicate(file, [...files, ...accepted])) {
        errors.push(`${file.name}: este arquivo já está selecionado.`);
        continue;
      }

      accepted.push(file);
    }

    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
    setFeedback(errors.length > 0
      ? errors.join(" ")
      : accepted.length > 0
        ? `${accepted.length} ${accepted.length === 1 ? "arquivo selecionado" : "arquivos selecionados"}.`
        : "");

    // Allows selecting the same file again after removing it from the queue.
    event.currentTarget.value = "";
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, fileIndex) => fileIndex !== index));
    setFeedback("Arquivo removido da seleção.");
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className="composer-tool"
        aria-label="Selecionar arquivos para anexar"
        title="Anexar arquivos"
        onClick={() => inputRef.current?.click()}
      >
        ＋
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        multiple
        accept={ACCEPTED_MIME_TYPES}
        onChange={handleSelection}
        aria-label="Selecionar imagens, vídeos, áudios ou documentos"
      />

      {(files.length > 0 || feedback) && (
        <section className={styles.queue} aria-label="Arquivos selecionados">
          <div className={styles.heading}>
            <strong>Arquivos selecionados</strong>
            <span>{files.length}</span>
          </div>

          {files.length > 0 && (
            <ul className={styles.list}>
              {files.map((file, index) => {
                const category = getCategory(file) ?? "document";
                return (
                  <li className={styles.item} key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <span className={styles.fileIcon} aria-hidden="true">
                      {category === "image" ? "▧" : category === "audio" ? "♫" : category === "video" ? "▶" : "▤"}
                    </span>
                    <span className={styles.fileInfo}>
                      <strong title={file.name}>{file.name}</strong>
                      <small>{CATEGORY_LABELS[category]} · {formatSize(file.size)}</small>
                    </span>
                    <span className={styles.pending}>Selecionado</span>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeFile(index)}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
          <p className={styles.disclaimer}>
            Seleção local apenas. O arquivo não foi enviado; upload, verificação de conteúdo e autorização dependem da integração.
          </p>
        </section>
      )}
    </div>
  );
}

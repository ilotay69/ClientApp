"use client";
import { useId, useState } from "react";
import { validateClientDocument } from "@/lib/client-workspace";
import s from "./client-surfaces.module.css";
/** File selection only. Upload success belongs to the server response. */
export function CGDocumentDropzone({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  function select(files: FileList | null) {
    if (disabled) return;
    if (!files?.length) return;
    if (files.length !== 1) {
      setError("Upload one document at a time.");
      return;
    }
    const next = files[0];
    const invalid = validateClientDocument(next);
    setError(invalid);
    if (!invalid) onChange(next);
  }
  return (
    <div>
      <label
        className={s.dropzone}
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          select(e.dataTransfer.files);
        }}
      >
        <span className={s.documentIcon} aria-hidden="true">
          ↥
        </span>
        <span>{file ? file.name : "Drop a document or choose a file"}</span>
        <span className={s.muted}>PDF, Word or Excel · up to 20 MB</span>
        <input
          aria-label="Choose document"
          aria-describedby={error ? id : undefined}
          disabled={disabled}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => {
            select(e.target.files);
            e.target.value = "";
          }}
        />
        {file && (
          <span className={s.muted}>
            {file.size < 1024
              ? `${file.size} bytes`
              : file.size < 1024 * 1024
                ? `${(file.size / 1024).toFixed(1)} KB`
                : `${(file.size / 1024 / 1024).toFixed(2)} MB`}{" "}
            · Ready to upload
          </span>
        )}
      </label>
      {file && (
        <button
          type="button"
          className={s.button}
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setError(null);
          }}
        >
          Remove selected file
        </button>
      )}
      {error && (
        <p id={id} className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

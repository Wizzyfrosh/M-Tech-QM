"use client";
import { useRef, useState } from "react";
import { Upload, X, RotateCw } from "lucide-react";
import {
  fileSize,
  MAX_ASSIGNMENT_FILE,
  MAX_SUBMISSION_BYTES,
  validFileName,
  type AssignmentFileInfo,
} from "@/lib/assignment-file-policy";
export function AssignmentFileUpload({
  assignmentId,
  value,
  onChange,
  disabled,
  onBusyChange,
}: {
  assignmentId: string;
  value: AssignmentFileInfo[];
  onChange: (files: AssignmentFileInfo[]) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [job, setJob] = useState<{ file: File; id: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  function upload(file: File, id: string) {
    setError("");
    if (
      !validFileName(file.name) ||
      file.size <= 0 ||
      file.size > MAX_ASSIGNMENT_FILE
    ) {
      setError(
        "Choose a ZIP, PDF, PNG, JPEG or WebP file no larger than 3 MB.",
      );
      return;
    }
    if (
      value.length >= 5 ||
      value.reduce((n, f) => n + f.size, file.size) > MAX_SUBMISSION_BYTES
    ) {
      setError(
        "Attach up to five files, with a combined size no larger than 9 MB.",
      );
      return;
    }
    setJob({ file, id });
    setBusy(true);
    onBusyChange(true);
    setProgress(0);
    const request = new XMLHttpRequest();
    request.open("POST", `/api/assignments/${assignmentId}/files`);
    request.timeout = 60000;
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("x-upload-id", id);
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    const finish = () => {
      setBusy(false);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    };
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300)
          throw Error(result.error || "Upload failed. Try again.");
        onChange([...value.filter((f) => f.id !== result.id), result]);
        setJob(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed. Try again.");
      }
      finish();
    };
    request.onerror = request.ontimeout = () => {
      setError(
        "The upload was interrupted. Retry to recover the same file without creating another copy.",
      );
      finish();
    };
    request.send(file);
  }
  return (
    <section className="assignment-upload" aria-label="Assignment attachments">
      <h3>Attach files</h3>
      <p className="muted">
        ZIP, PDF, PNG, JPEG or WebP. Up to 3 MB each; five files and 9 MB total
        per submission.
      </p>
      <label className="assignment-upload-label">
        <Upload size={18} /> Choose a file
        <input
          ref={input}
          type="file"
          aria-label="Assignment file"
          accept=".zip,.pdf,.png,.jpg,.jpeg,.webp"
          disabled={disabled || busy || value.length >= 5}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file, crypto.randomUUID());
          }}
        />
      </label>
      {busy && (
        <p role="status">
          {progress < 100
            ? `Uploading ${progress}%…`
            : "Checking and saving file…"}
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          {job && (
            <button
              className="button"
              type="button"
              disabled={disabled || busy}
              onClick={() => upload(job.file, job.id)}
            >
              <RotateCw size={16} />
              Retry file upload
            </button>
          )}
        </div>
      )}
      <ul className="assignment-upload-list">
        {value.map((file) => (
          <li key={file.id}>
            <span>
              <strong>{file.name}</strong>
              <small>{fileSize(file.size)}</small>
            </span>
            <button
              className="button"
              type="button"
              disabled={disabled || busy}
              aria-label={`Remove ${file.name} from draft`}
              onClick={() => onChange(value.filter((f) => f.id !== file.id))}
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <details>
        <summary>Preparing a Flutter project ZIP</summary>
        <p>
          Include lib/, test/, assets/, pubspec.yaml and other project source
          files. Exclude build/, .dart_tool/, .git/ and generated caches to keep
          the ZIP small. Exclude secrets and signing keys. For larger projects,
          use a fixed GitHub commit link.
        </p>
      </details>
      <p className="muted">
        Save the draft or submit after adding files. Files in submitted history
        are preserved when you revise your work.
      </p>
    </section>
  );
}

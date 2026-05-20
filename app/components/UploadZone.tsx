'use client';

import { useRef, useState, useCallback } from 'react';

interface UploadZoneProps {
  onFile: (file: File) => void;
  file: File | null;
}

export default function UploadZone({ onFile, file }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped?.type === 'application/pdf') onFile(dropped);
    },
    [onFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onFile(selected);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded border-2 border-dashed p-10 text-center transition-all duration-150 ${
        dragging
          ? 'border-jeci-gold bg-jeci-gold/5'
          : file
          ? 'border-jeci-success/60 bg-jeci-success/5'
          : 'border-jeci-border hover:border-jeci-gold/40 hover:bg-jeci-gold/5'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleChange}
        className="hidden"
      />

      {file ? (
        <div className="space-y-2 font-mono">
          <p className="text-jeci-success text-sm">[✓] FILE LOADED</p>
          <p className="text-jeci-text text-sm">{file.name}</p>
          <p className="text-jeci-muted text-xs">
            {(file.size / 1024 / 1024).toFixed(2)} MB · click to replace
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-jeci-muted text-xs uppercase tracking-widest mb-4">
            // DROP_PDF_REPORT
          </p>
          <p className="text-jeci-text text-sm">
            Drag your credit report here
          </p>
          <p className="text-jeci-muted text-xs">
            or click to browse · PDF files only · max 10 MB
          </p>
          <p className="text-jeci-muted/50 font-mono text-xs mt-4">
            compatible: experian · equifax · transunion · credit karma · myfico
          </p>
        </div>
      )}
    </div>
  );
}

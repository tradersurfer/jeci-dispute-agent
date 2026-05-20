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
      className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
        dragging
          ? 'border-credora-gold bg-credora-gold/5 scale-[1.01]'
          : file
          ? 'border-green-500/60 bg-green-500/5'
          : 'border-credora-border hover:border-credora-gold/50 hover:bg-credora-gold/5'
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
        <div className="space-y-2">
          <div className="text-3xl">📄</div>
          <p className="text-credora-text font-medium">{file.name}</p>
          <p className="text-credora-muted text-sm">
            {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-4xl opacity-60">📎</div>
          <div>
            <p className="text-credora-text font-medium mb-1">
              Drop your credit report here
            </p>
            <p className="text-credora-muted text-sm">
              or click to browse · PDF files only · max 10MB
            </p>
          </div>
          <p className="text-credora-muted/60 text-xs">
            Works with Experian, Equifax, TransUnion, Credit Karma, myFICO reports
          </p>
        </div>
      )}
    </div>
  );
}

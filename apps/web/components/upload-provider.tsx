"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface UploadProgress {
  id: string;
  name: string;
  progress: number;
  speed: string;
  size: number;
  uploaded: number;
}

interface UploadContextType {
  uploads: UploadProgress[];
  addUpload: (upload: UploadProgress) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  const addUpload = useCallback((upload: UploadProgress) => {
    setUploads((prev) => [...prev, upload]);
  }, []);

  const updateUpload = useCallback((id: string, updates: Partial<UploadProgress>) => {
    setUploads((prev) =>
      prev.map((upload) => (upload.id === id ? { ...upload, ...updates } : upload))
    );
  }, []);

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  return (
    <UploadContext.Provider value={{ uploads, addUpload, updateUpload, removeUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploads() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error("useUploads must be used within a UploadProvider");
  }
  return context;
}

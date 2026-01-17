"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  BsSun,
  BsMoon,
  BsFolder,
  BsFileEarmark,
  BsUpload,
  BsDownload,
  BsTrash,
  BsArrowLeft,
  BsPlus,
  BsChevronUp,
  BsChevronDown,
  BsChevronExpand,
  BsThreeDotsVertical,
  BsPencil,
  BsFileText,
  BsHddFill,
  BsX,
  BsCloudUpload,
  BsEye,
  BsEyeSlash,
  BsSearch,
  BsTerminal,
  BsClipboard,
} from "react-icons/bs";
import { servers } from "@/lib/api";
import type { FileInfo } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { useAuth } from "@/components/auth-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { toast } from "sonner";
import { useUploads, type UploadProgress } from "@/components/upload-provider";

interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  size: string;
  sizeBytes: number;
  modified: string;
  path: string;
}

const EDITABLE_EXTENSIONS = [
  ".yml",
  ".yaml",
  ".json",
  ".txt",
  ".properties",
  ".conf",
  ".cfg",
  ".ini",
  ".log",
  ".md",
  ".sh",
  ".bat",
  ".toml",
];

// Helper to parse daemon error messages
const parseDaemonError = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message;
    // Try to parse JSON error from daemon
    try {
      // Check if the message contains JSON
      const jsonMatch = message.match(/\{.*"error".*"message".*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error === "Conflict" && parsed.message) {
          // Extract the name from "Already exists: name"
          const existsMatch = parsed.message.match(/Already exists:\s*(.+)/);
          if (existsMatch) {
            return `"${existsMatch[1]}" already exists`;
          }
          return parsed.message;
        }
        return parsed.message || message;
      }
    } catch {
      // If parsing fails, try simpler extraction
      if (message.includes("Already exists")) {
        const match = message.match(/Already exists:\s*([^"}\]]+)/);
        if (match?.[1]) {
          return `"${match[1].trim()}" already exists`;
        }
        return "File or folder already exists";
      }
    }
    return message;
  }
  return "An unknown error occurred";
};

const FilesPage = (): JSX.Element | null => {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const pathSegments = params.path as string[] | undefined;
  const { server, isInstalling } = useServer();
  const { user } = useAuth();
  const { playSound } = useSoundEffects();
  const { uploads, addUpload, updateUpload, removeUpload } = useUploads();

  // Derive current path from URL params
  const currentPath = pathSegments && pathSegments.length > 0 ? "/" + pathSegments.join("/") : "/";

  const [mounted, setMounted] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState<FileItem | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileNameInput, setNewFileNameInput] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  const [diskUsage, setDiskUsage] = useState<{ used: number; total: number }>({
    used: 0,
    total: 0,
  });
  const [showHiddenFiles, setShowHiddenFiles] = useState(() => {
    // Load preference from localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("stellarstack-show-hidden-files");
      return stored === "true";
    }
    return false;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sftpModalOpen, setSftpModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [fileToEditPermissions, setFileToEditPermissions] = useState<FileItem | null>(null);
  const [permissions, setPermissions] = useState({
    owner: { read: true, write: true, execute: false },
    group: { read: true, write: false, execute: false },
    others: { read: true, write: false, execute: false },
  });

  // Storage info - total from server allocation, used from actual disk usage
  const storageUsedGB = diskUsage.used / (1024 * 1024 * 1024);
  const storageTotalGB =
    diskUsage.total > 0
      ? diskUsage.total / (1024 * 1024 * 1024)
      : server
        ? (typeof server.disk === "string" ? parseInt(server.disk, 10) : server.disk) / 1024
        : 10; // fallback to server.disk (in MiB) if no limit set
  const storagePercentage = storageTotalGB > 0 ? (storageUsedGB / storageTotalGB) * 100 : 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const fetchDiskUsage = useCallback(async () => {
    try {
      const usage = await servers.files.diskUsage(serverId);
      console.log("[Disk Usage] Response:", usage);

      // Use the limit from daemon if available, otherwise fall back to server config
      const totalBytes = usage.limit_bytes || (server?.disk ? server.disk * 1024 * 1024 : 0);
      const usedBytes = usage.used_bytes || 0;

      console.log("[Disk Usage] Used:", usedBytes, "Total:", totalBytes);
      setDiskUsage({ used: usedBytes, total: totalBytes });
    } catch (error) {
      console.error("[Disk Usage] Failed to fetch disk usage:", error);
      // Fall back to server config if daemon request fails
      if (server?.disk) {
        setDiskUsage({ used: 0, total: server.disk * 1024 * 1024 });
      }
    }
  }, [serverId, server?.disk]);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await servers.files.list(
        serverId,
        currentPath === "/" ? undefined : currentPath
      );
      const mappedFiles: FileItem[] = data.files.map((f: FileInfo) => ({
        id: f.path,
        name: f.name,
        type: f.type === "directory" ? "folder" : "file",
        size: f.type === "directory" ? "--" : formatFileSize(f.size),
        sizeBytes: f.size,
        modified: new Date(f.modified).toLocaleString(),
        path: f.path,
      }));
      setFiles(mappedFiles);
      // Refresh disk usage after file list changes
      fetchDiskUsage();
    } catch (error) {
      toast.error("Failed to fetch files");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, currentPath, fetchDiskUsage]);

  useEffect(() => {
    fetchFiles();
    setRowSelection({});
  }, [fetchFiles]);

  // Global drag-and-drop handlers
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const droppedFiles = Array.from(e.dataTransfer.files);
        handleDroppedFiles(droppedFiles);
      }
    };

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [currentPath, serverId]);

  // Handle dropped files - upload directly with optimistic updates
  const handleDroppedFiles = async (droppedFiles: File[]) => {
    if (droppedFiles.length === 0 || isUploading) return;

    setIsUploading(true);
    const toastId = toast.loading(`Uploading ${droppedFiles.length} file(s)...`);

    try {
      let successCount = 0;
      let failCount = 0;
      const newFiles: FileItem[] = [];

      for (const file of droppedFiles) {
        try {
          const content = await file.text();
          const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
          await servers.files.create(serverId, filePath, "file", content);
          successCount++;

          // Add to optimistic list
          newFiles.push({
            id: filePath,
            name: file.name,
            type: "file",
            size: formatFileSize(file.size),
            sizeBytes: file.size,
            modified: new Date().toLocaleString(),
            path: filePath,
          });
        } catch {
          failCount++;
        }
      }

      // Optimistically add new files (filter out duplicates)
      if (newFiles.length > 0) {
        setFiles((prev) => {
          const existingPaths = new Set(prev.map((f) => f.path));
          const uniqueNewFiles = newFiles.filter((f) => !existingPaths.has(f.path));
          return [...prev, ...uniqueNewFiles];
        });
      }

      if (failCount === 0) {
        toast.success(`Uploaded ${successCount} file(s)`, { id: toastId });
      } else if (successCount === 0) {
        toast.error(`Failed to upload files`, { id: toastId });
      } else {
        toast.warning(`Uploaded ${successCount}, failed ${failCount}`, { id: toastId });
      }

      // Refresh disk usage
      fetchDiskUsage();
    } catch (error) {
      toast.error(parseDaemonError(error), { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Navigation helpers
  const navigateToFolder = (folderName: string) => {
    const newPath = currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`;
    router.push(`/servers/${serverId}/files${newPath}`);
  };

  const navigateUp = () => {
    if (currentPath === "/") return;
    const segments = currentPath.split("/").filter(Boolean);
    segments.pop();
    const parentPath = segments.length > 0 ? `/${segments.join("/")}` : "";
    router.push(`/servers/${serverId}/files${parentPath}`);
  };

  const getBasePath = () => `/servers/${serverId}/files`;

  // Build breadcrumb segments
  const breadcrumbSegments = useMemo(() => {
    if (currentPath === "/") return [];
    return currentPath.split("/").filter(Boolean);
  }, [currentPath]);

  const isEditable = (fileName: string) => {
    return EDITABLE_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
  };

  const handleDelete = (file: FileItem) => {
    setFileToDelete(file);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    const deletePath = fileToDelete.path;
    try {
      await servers.files.delete(serverId, deletePath);
      // Optimistically remove from list
      setFiles((prev) => prev.filter((f) => f.path !== deletePath));
      toast.success("File deleted");
      fetchDiskUsage();
    } catch (error) {
      toast.error("Failed to delete file");
    } finally {
      setFileToDelete(null);
      setDeleteModalOpen(false);
    }
  };

  const handleBulkDelete = () => {
    setBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    const selectedIds = Object.keys(rowSelection);
    try {
      await Promise.all(selectedIds.map((path) => servers.files.delete(serverId, path)));
      // Optimistically remove from list
      setFiles((prev) => prev.filter((f) => !selectedIds.includes(f.path)));
      toast.success(`Deleted ${selectedIds.length} file(s)`);
      setRowSelection({});
      fetchDiskUsage();
    } catch (error) {
      toast.error("Failed to delete some files");
      // Refetch on error to ensure consistency
      fetchFiles();
    } finally {
      setBulkDeleteModalOpen(false);
    }
  };

  const handleRename = (file: FileItem) => {
    setFileToRename(file);
    setNewFileName(file.name);
    setRenameModalOpen(true);
  };

  const confirmRename = async () => {
    if (!fileToRename || !newFileName.trim()) return;
    const oldPath = fileToRename.path;
    const newPath =
      currentPath === "/" ? `/${newFileName.trim()}` : `${currentPath}/${newFileName.trim()}`;
    const newName = newFileName.trim();
    try {
      await servers.files.rename(serverId, oldPath, newPath);
      // Optimistically update the file in list
      setFiles((prev) =>
        prev.map((f) =>
          f.path === oldPath ? { ...f, name: newName, path: newPath, id: newPath } : f
        )
      );
      toast.success("File renamed");
    } catch (error) {
      toast.error(parseDaemonError(error));
    } finally {
      setRenameModalOpen(false);
      setFileToRename(null);
      setNewFileName("");
    }
  };

  const handleEditPermissions = (file: FileItem) => {
    setFileToEditPermissions(file);
    // TODO: Fetch current permissions from API and set them
    // For now, use default permissions (644 for files, 755 for folders)
    if (file.type === "folder") {
      setPermissions({
        owner: { read: true, write: true, execute: true },
        group: { read: true, write: false, execute: true },
        others: { read: true, write: false, execute: true },
      });
    } else {
      setPermissions({
        owner: { read: true, write: true, execute: false },
        group: { read: true, write: false, execute: false },
        others: { read: true, write: false, execute: false },
      });
    }
    setPermissionsModalOpen(true);
  };

  const confirmPermissions = async () => {
    if (!fileToEditPermissions) return;
    // Convert permissions to octal
    const toOctal = (p: { read: boolean; write: boolean; execute: boolean }) =>
      (p.read ? 4 : 0) + (p.write ? 2 : 0) + (p.execute ? 1 : 0);
    const mode = `${toOctal(permissions.owner)}${toOctal(permissions.group)}${toOctal(permissions.others)}`;

    try {
      await servers.files.chmod(serverId, fileToEditPermissions.path, mode);
      toast.success(`Permissions updated to ${mode}`);
      playSound("copy");
      setPermissionsModalOpen(false);
      setFileToEditPermissions(null);
    } catch (error) {
      toast.error(parseDaemonError(error));
    }
  };

  const handleNewFolder = () => {
    setNewFolderName("");
    setNewFolderModalOpen(true);
  };

  const confirmNewFolder = async () => {
    if (!newFolderName.trim()) return;
    const folderPath =
      currentPath === "/" ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
    const folderName = newFolderName.trim();
    try {
      await servers.files.create(serverId, folderPath, "directory");
      // Optimistically add folder to list and sort
      setFiles((prev) => {
        const newFiles = [
          ...prev,
          {
            id: folderPath,
            name: folderName,
            type: "folder" as const,
            size: "--",
            sizeBytes: 0,
            modified: new Date().toLocaleString(),
            path: folderPath,
          },
        ];
        // Sort: folders first (alphabetically), then files (alphabetically)
        return newFiles.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === "folder" ? -1 : 1;
        });
      });
      playSound("copy");
      toast.success("Folder created");
    } catch (error) {
      toast.error(parseDaemonError(error));
    } finally {
      setNewFolderModalOpen(false);
      setNewFolderName("");
    }
  };

  const handleNewFile = () => {
    setNewFileNameInput("");
    setNewFileModalOpen(true);
  };

  const confirmNewFile = async () => {
    if (!newFileNameInput.trim()) return;
    const filePath =
      currentPath === "/"
        ? `/${newFileNameInput.trim()}`
        : `${currentPath}/${newFileNameInput.trim()}`;
    const fileName = newFileNameInput.trim();
    try {
      await servers.files.create(serverId, filePath, "file", "");
      // Optimistically add file to list and sort
      setFiles((prev) => {
        const newFiles = [
          ...prev,
          {
            id: filePath,
            name: fileName,
            type: "file" as const,
            size: "0 B",
            sizeBytes: 0,
            modified: new Date().toLocaleString(),
            path: filePath,
          },
        ];
        // Sort: folders first (alphabetically), then files (alphabetically)
        return newFiles.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === "folder" ? -1 : 1;
        });
      });
      playSound("copy");
      toast.success("File created");
      setNewFileModalOpen(false);
      setNewFileNameInput("");
      // Redirect to editor if file is editable
      if (isEditable(fileName)) {
        router.push(`/servers/${serverId}/files/edit?path=${encodeURIComponent(filePath)}`);
      }
    } catch (error) {
      toast.error(parseDaemonError(error));
    }
  };

  const handleEdit = (file: FileItem) => {
    // Navigate to the dedicated file edit page
    router.push(`/servers/${serverId}/files/edit?path=${encodeURIComponent(file.path)}`);
  };

  const handleUploadClick = () => {
    setUploadFiles([]);
    setUploadModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmUpload = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    const newFiles: FileItem[] = [];
    setUploadModalOpen(false);

    const startTime = Date.now();
    const totalSize = uploadFiles.reduce((sum, file) => sum + file.size, 0);

    for (const file of uploadFiles) {
      const fileId = `upload-${Date.now()}-${Math.random()}`;

      addUpload({
        id: fileId,
        name: file.name,
        progress: 0,
        speed: "0 KB/s",
        size: file.size,
        uploaded: 0,
      });

      try {
        const content = await file.text();
        const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
        await servers.files.create(serverId, filePath, "file", content);

        newFiles.push({
          id: filePath,
          name: file.name,
          type: "file",
          size: formatFileSize(file.size),
          sizeBytes: file.size,
          modified: new Date().toLocaleString(),
          path: filePath,
        });

        updateUpload(fileId, {
          progress: 100,
          speed: calculateSpeed(startTime, file.size, Date.now()),
        });
        removeUpload(fileId);
      } catch (error) {
        removeUpload(fileId);
        throw error;
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path));
        const uniqueNewFiles = newFiles.filter((f) => !existingPaths.has(f.path));
        const updatedFiles = [...prev, ...uniqueNewFiles];
        return updatedFiles.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === "folder" ? -1 : 1;
        });
      });
    }

    playSound("copy");
    toast.success(`Uploaded ${uploadFiles.length} file(s)`);
    setUploadFiles([]);
    fetchDiskUsage();
    setIsUploading(false);
  };

  const calculateSpeed = (startTime: number, totalBytes: number, currentTime: number): string => {
    const elapsed = (currentTime - startTime) / 1000;
    if (elapsed === 0) return "0 KB/s";
    const speed = totalBytes / elapsed / 1024;
    if (speed < 1024) return `${speed.toFixed(1)} KB/s`;
    return `${(speed / 1024).toFixed(1)} MB/s`;
  };

  const columns: ColumnDef<FileItem>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className={cn(
              "border-zinc-600",
              "data-[state=checked]:bg-zinc-600"
            )}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className={cn(
              "border-zinc-600",
              "data-[state=checked]:bg-zinc-600"
            )}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <button
              className={cn(
                "flex items-center gap-2 transition-colors",
                "hover:text-zinc-100"
              )}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Name
              {column.getIsSorted() === "asc" ? (
                <BsChevronUp className="h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <BsChevronDown className="h-3 w-3" />
              ) : (
                <BsChevronExpand className="h-3 w-3 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => {
          const file = row.original;
          return (
            <div className="flex items-center gap-3">
              {file.type === "folder" ? (
                <BsFolder className={cn("h-4 w-4", "text-amber-400")} />
              ) : (
                <BsFileEarmark
                  className={cn("h-4 w-4", "text-zinc-400")}
                />
              )}
              <span
                className={cn(
                  "cursor-pointer hover:underline",
                  "text-zinc-200"
                )}
                onClick={() => {
                  if (file.type === "folder") {
                    navigateToFolder(file.name);
                  } else if (file.type === "file" && isEditable(file.name)) {
                    handleEdit(file);
                  }
                }}
              >
                {file.name}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "size",
        header: ({ column }) => {
          return (
            <button
              className={cn(
                "flex items-center gap-2 transition-colors",
                "hover:text-zinc-100"
              )}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Size
              {column.getIsSorted() === "asc" ? (
                <BsChevronUp className="h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <BsChevronDown className="h-3 w-3" />
              ) : (
                <BsChevronExpand className="h-3 w-3 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => (
          <span className={cn("text-xs", "text-zinc-500")}>
            {row.getValue("size")}
          </span>
        ),
      },
      {
        accessorKey: "modified",
        header: ({ column }) => {
          return (
            <button
              className={cn(
                "flex items-center gap-2 transition-colors",
                "hover:text-zinc-100"
              )}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Modified
              {column.getIsSorted() === "asc" ? (
                <BsChevronUp className="h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <BsChevronDown className="h-3 w-3" />
              ) : (
                <BsChevronExpand className="h-3 w-3 opacity-50" />
              )}
            </button>
          );
        },
        cell: ({ row }) => (
          <span className={cn("text-xs", "text-zinc-500")}>
            {row.getValue("modified")}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span>Actions</span>,
        cell: ({ row }) => {
          const file = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "p-1 transition-colors",
                    "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  <BsThreeDotsVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(
                  "min-w-[160px]",
                  "border-zinc-700 bg-zinc-900"
                )}
              >
                <DropdownMenuItem
                  onClick={() => handleRename(file)}
                  className={cn(
                    "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                    "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                  )}
                >
                  <BsPencil className="h-3 w-3" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleEditPermissions(file)}
                  className={cn(
                    "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                    "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                  )}
                >
                  <BsTerminal className="h-3 w-3" />
                  Permissions
                </DropdownMenuItem>
                {file.type === "file" && isEditable(file.name) && (
                  <DropdownMenuItem
                    onClick={() => handleEdit(file)}
                    className={cn(
                      "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                      "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                    )}
                  >
                    <BsFileText className="h-3 w-3" />
                    Edit
                  </DropdownMenuItem>
                )}
                {file.type === "file" && (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const { downloadUrl } = await servers.files.getDownloadToken(
                          serverId,
                          file.path
                        );
                        window.open(
                          `${typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? window.location.origin : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}${downloadUrl}`,
                          "_blank"
                        );
                      } catch (error) {
                        toast.error("Failed to generate download link");
                      }
                    }}
                    className={cn(
                      "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                      "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                    )}
                  >
                    <BsDownload className="h-3 w-3" />
                    Download
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuItem
                  onClick={() => handleDelete(file)}
                  className={cn(
                    "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                    "text-red-400 focus:bg-red-950/50 focus:text-red-300"
                  )}
                >
                  <BsTrash className="h-3 w-3" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentPath, serverId]
  );

  // Toggle hidden files visibility
  const handleToggleHiddenFiles = useCallback(() => {
    const newValue = !showHiddenFiles;
    setShowHiddenFiles(newValue);
    localStorage.setItem("stellarstack-show-hidden-files", String(newValue));
  }, [showHiddenFiles]);

  // Filter files based on hidden files preference
  const displayFiles = useMemo(() => {
    let filtered = files;

    // Filter hidden files
    if (!showHiddenFiles) {
      filtered = filtered.filter((file) => !file.name.startsWith("."));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((file) => file.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [files, showHiddenFiles, searchQuery]);

  const table = useReactTable({
    data: displayFiles,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
        <ServerInstallingPlaceholder serverName={server?.name} />
      </div>
    );
  }

  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh">
        <ServerSuspendedPlaceholder serverName={server?.name} />
      </div>
    );
  }

  return (
    <div className="relative min-h-svh transition-colors">
      {/* Background is now rendered in the layout for persistence */}

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  "text-zinc-400 hover:text-zinc-100"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    "text-zinc-100"
                  )}
                >
                  FILE MANAGER
                </h1>
                {/* Breadcrumb Navigation */}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className={cn("text-sm", "text-zinc-500")}>
                    {server?.name || `Server ${serverId}`} -
                  </span>
                  <Link
                    href={getBasePath()}
                    className={cn(
                      "text-sm transition-colors hover:underline",
                      "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    /
                  </Link>
                  {breadcrumbSegments.map((segment, index) => {
                    const pathUpToHere = "/" + breadcrumbSegments.slice(0, index + 1).join("/");
                    const isLast = index === breadcrumbSegments.length - 1;
                    return (
                      <span key={pathUpToHere} className="flex items-center gap-1">
                        <span className={cn("text-sm", "text-zinc-600")}>
                          /
                        </span>
                        {isLast ? (
                          <span
                            className={cn("text-sm", "text-zinc-300")}
                          >
                            {segment}
                          </span>
                        ) : (
                          <Link
                            href={`${getBasePath()}${pathUpToHere}`}
                            className={cn(
                              "text-sm transition-colors hover:underline",
                              "text-zinc-500 hover:text-zinc-300"
                            )}
                          >
                            {segment}
                          </Link>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          {/* Storage Indicator */}
          <div
            className={cn(
              "relative mb-6 border p-4",
              "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                "border-zinc-500"
              )}
            />

            <div className="flex items-center gap-4">
              <BsHddFill className={cn("h-5 w-5", "text-zinc-400")} />
              <div className="flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Storage
                  </span>
                  <span className={cn("text-xs", "text-zinc-400")}>
                    {storageUsedGB.toFixed(2)} GB / {storageTotalGB.toFixed(1)} GB
                  </span>
                </div>
                <div className={cn("h-2 w-full", "bg-zinc-800")}>
                  <div
                    className={cn(
                      "h-full transition-all",
                      storagePercentage > 90
                        ? "bg-red-500"
                        : storagePercentage > 70
                          ? "bg-amber-500"
                          : "bg-green-500"
                    )}
                    style={{ width: `${Math.min(100, storagePercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div
            className={cn(
              "relative mb-6 border p-4",
              "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 h-2 w-2 border-t border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-2 w-2 border-t border-r",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                "border-zinc-500"
              )}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPath === "/"}
                  onClick={navigateUp}
                  className={cn(
                    "gap-2 transition-all",
                    true
                      ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-30"
                  )}
                >
                  <BsArrowLeft className="h-4 w-4" />
                  <span className="hidden text-xs tracking-wider uppercase sm:inline">Back</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewFolder}
                  className={cn(
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  <span className="hidden text-xs tracking-wider uppercase sm:inline">
                    New Folder
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewFile}
                  className={cn(
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                >
                  <BsFileText className="h-4 w-4" />
                  <span className="hidden text-xs tracking-wider uppercase sm:inline">
                    New File
                  </span>
                </Button>
                {selectedCount > 0 && (
                  <span className={cn("ml-2 text-xs", "text-zinc-500")}>
                    {selectedCount} selected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Search Input */}
                <div className="relative">
                  <BsSearch
                    className={cn(
                      "absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 transition-colors",
                      "text-zinc-500"
                    )}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className={cn(
                      "h-9 w-32 border pr-8 pl-9 text-xs transition-colors outline-none sm:w-48",
                      true
                        ? "border-zinc-700 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500"
                        : "border-zinc-300 bg-white text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400"
                    )}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className={cn(
                        "absolute top-1/2 right-2 -translate-y-1/2 transition-colors",
                        "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      <BsX className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSftpModalOpen(true)}
                  className={cn(
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                  title="SFTP Connection"
                >
                  <BsTerminal className="h-4 w-4" />
                  <span className="hidden text-xs tracking-wider uppercase md:inline">SFTP</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUploadClick}
                  className={cn(
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                  title="Upload Files"
                >
                  <BsUpload className="h-4 w-4" />
                  <span className="hidden text-xs tracking-wider uppercase md:inline">Upload</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleHiddenFiles}
                  className={cn(
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  )}
                  title={showHiddenFiles ? "Hide hidden files" : "Show hidden files"}
                >
                  {showHiddenFiles ? (
                    <BsEye className="h-4 w-4" />
                  ) : (
                    <BsEyeSlash className="h-4 w-4" />
                  )}
                  <span className="text-xs tracking-wider uppercase">
                    {showHiddenFiles ? "Showing Hidden" : "Show Hidden"}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0}
                  onClick={handleBulkDelete}
                  className={cn(
                    "gap-2 transition-all",
                    true
                      ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300 disabled:opacity-30"
                      : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700 disabled:opacity-30"
                  )}
                >
                  <BsTrash className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Delete</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div
            className={cn(
              "relative border",
              true
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            <div
              className={cn(
                "absolute top-0 left-0 z-10 h-3 w-3 border-t border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 z-10 h-3 w-3 border-t border-r",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 z-10 h-3 w-3 border-b border-l",
                "border-zinc-500"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 z-10 h-3 w-3 border-r border-b",
                "border-zinc-500"
              )}
            />

            <div>
              <Table>
                <TableHeader className="sticky top-0 z-20">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow
                      key={headerGroup.id}
                      className={cn(
                        "border-b",
                        true
                          ? "border-zinc-700/50 bg-[#0a0a0a] hover:bg-transparent"
                          : "border-zinc-200 bg-white hover:bg-transparent"
                      )}
                    >
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "px-4 text-[10px] font-medium tracking-wider uppercase",
                            "text-zinc-500"
                          )}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className={cn(
                          "h-24 text-center text-sm",
                          "text-zinc-500"
                        )}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Spinner className="h-4 w-4" />
                          Loading files...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => {
                          const file = row.original;
                          return (
                            <ContextMenu key={row.original.id}>
                              <ContextMenuTrigger asChild>
                                <motion.tr
                                  layout
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                                  transition={{ duration: 0.2, ease: "easeOut" }}
                                  data-state={row.getIsSelected() && "selected"}
                                  className={cn(
                                    "cursor-pointer border-b transition-colors",
                                    true
                                      ? "border-zinc-800/50 hover:bg-zinc-800/30 data-[state=selected]:bg-zinc-800/50"
                                      : "border-zinc-100 hover:bg-zinc-100/50 data-[state=selected]:bg-zinc-200/50"
                                  )}
                                >
                                  {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id} className="px-4 py-3">
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  ))}
                                </motion.tr>
                              </ContextMenuTrigger>
                              <ContextMenuContent
                                className={cn(
                                  "min-w-[160px]",
                                  true
                                    ? "border-zinc-700 bg-zinc-900"
                                    : "border-zinc-200 bg-white"
                                )}
                              >
                                <ContextMenuItem
                                  onClick={() => handleRename(file)}
                                  className={cn(
                                    "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                                  )}
                                >
                                  <BsPencil className="h-3 w-3" />
                                  Rename
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => handleEditPermissions(file)}
                                  className={cn(
                                    "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                                  )}
                                >
                                  <BsTerminal className="h-3 w-3" />
                                  Permissions
                                </ContextMenuItem>
                                {file.type === "file" && isEditable(file.name) && (
                                  <ContextMenuItem
                                    onClick={() => handleEdit(file)}
                                    className={cn(
                                      "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                                      true
                                        ? "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                                        : "text-zinc-700 focus:bg-zinc-100"
                                    )}
                                  >
                                    <BsFileText className="h-3 w-3" />
                                    Edit
                                  </ContextMenuItem>
                                )}
                                {file.type === "file" && (
                                  <ContextMenuItem
                                    onClick={async () => {
                                      try {
                                        const { downloadUrl } =
                                          await servers.files.getDownloadToken(serverId, file.path);
                                        window.open(
                                          `${typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? window.location.origin : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}${downloadUrl}`,
                                          "_blank"
                                        );
                                      } catch (error) {
                                        toast.error("Failed to generate download link");
                                      }
                                    }}
                                    className={cn(
                                      "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                                      true
                                        ? "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                                        : "text-zinc-700 focus:bg-zinc-100"
                                    )}
                                  >
                                    <BsDownload className="h-3 w-3" />
                                    Download
                                  </ContextMenuItem>
                                )}
                                <ContextMenuSeparator
                                  className="bg-zinc-700"
                                />
                                <ContextMenuItem
                                  onClick={() => handleDelete(file)}
                                  className={cn(
                                    "cursor-pointer gap-2 text-xs tracking-wider uppercase",
                                    true
                                      ? "text-red-400 focus:bg-red-950/50 focus:text-red-300"
                                      : "text-red-600 focus:bg-red-50"
                                  )}
                                >
                                  <BsTrash className="h-3 w-3" />
                                  Delete
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={columns.length}
                            className={cn(
                              "h-24 text-center text-sm",
                              "text-zinc-500"
                            )}
                          >
                            {searchQuery
                              ? `No files matching "${searchQuery}" found.`
                              : "No files found."}
                          </TableCell>
                        </TableRow>
                      )}
                    </AnimatePresence>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Footer */}
          <div className={cn("mt-4 text-xs", "text-zinc-600")}>
            {table.getFilteredRowModel().rows.length} file(s) - {selectedCount} selected
          </div>
        </div>
      </div>

      {/* Drag and Drop Overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          >
            {/* Backdrop */}
            <div className={cn("absolute inset-0", "bg-black/80")} />

            {/* Drop zone indicator */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "relative border-4 border-dashed p-16 text-center",
                "border-zinc-500 bg-zinc-900/90"
              )}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <BsCloudUpload
                  className={cn(
                    "mx-auto mb-4 h-16 w-16",
                    "text-zinc-400"
                  )}
                />
              </motion.div>
              <p
                className={cn(
                  "text-xl font-light tracking-wider",
                  "text-zinc-200"
                )}
              >
                DROP FILES TO UPLOAD
              </p>
              <p className={cn("mt-2 text-sm", "text-zinc-500")}>
                Files will be uploaded to: {currentPath}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Single File Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete File"
        description={`Are you sure you want to delete "${fileToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
      />

      {/* Bulk Delete Modal */}
      <ConfirmationModal
        open={bulkDeleteModalOpen}
        onOpenChange={setBulkDeleteModalOpen}
        title="Delete Files"
        description={`Are you sure you want to delete ${selectedCount} selected file(s)? This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={confirmBulkDelete}
      />

      {/* Rename Modal */}
      <FormModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        title="Rename"
        description={`Enter a new name for "${fileToRename?.name}"`}
        submitLabel="Rename"
        onSubmit={confirmRename}
        isValid={newFileName.trim().length > 0}
      >
        <input
          type="text"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          placeholder="Enter new name"
          className={cn(
            "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500"
          )}
        />
      </FormModal>

      {/* New Folder Modal */}
      <FormModal
        open={newFolderModalOpen}
        onOpenChange={setNewFolderModalOpen}
        title="New Folder"
        description="Enter a name for the new folder"
        submitLabel="Create"
        onSubmit={confirmNewFolder}
        isValid={newFolderName.trim().length > 0}
      >
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="Folder name"
          className={cn(
            "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500"
          )}
        />
      </FormModal>

      {/* New File Modal */}
      <FormModal
        open={newFileModalOpen}
        onOpenChange={setNewFileModalOpen}
        title="New File"
        description="Enter a name for the new file"
        submitLabel="Create"
        onSubmit={confirmNewFile}
        isValid={newFileNameInput.trim().length > 0}
      >
        <input
          type="text"
          value={newFileNameInput}
          onChange={(e) => setNewFileNameInput(e.target.value)}
          placeholder="File name (e.g., config.yml)"
          className={cn(
            "w-full border px-3 py-2 text-sm transition-colors outline-none",
            true
              ? "border-zinc-700/50 bg-zinc-900/50 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500"
              : "border-zinc-300 bg-white text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400"
          )}
        />
      </FormModal>

      {/* SFTP Connection Modal */}
      <Dialog open={sftpModalOpen} onOpenChange={setSftpModalOpen}>
        <DialogContent
          className={cn(
            "max-w-2xl",
            "border-zinc-800 bg-zinc-900"
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn("text-lg font-semibold", "text-zinc-100")}
            >
              SFTP Connection Details
            </DialogTitle>
            <DialogDescription
              className={cn("text-sm", "text-zinc-400")}
            >
              Use these credentials to connect to your server via SFTP
            </DialogDescription>
          </DialogHeader>
          {server?.node && user && (
            <div className="mt-4 space-y-4">
              {/* Connection Details */}
              <div className="space-y-3">
                {/* Host */}
                <div>
                  <label
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      "text-zinc-500"
                    )}
                  >
                    Host
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "flex-1 rounded border px-3 py-2 font-mono text-sm",
                        true
                          ? "border-zinc-800 bg-zinc-950 text-zinc-200"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800"
                      )}
                    >
                      {server.node.host}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(server.node!.host);
                        toast.success("Host copied to clipboard");
                      }}
                      className={cn(
                        true
                          ? "border-zinc-700 hover:bg-zinc-800"
                          : "border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <BsClipboard className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Port */}
                <div>
                  <label
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      "text-zinc-500"
                    )}
                  >
                    Port
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "flex-1 rounded border px-3 py-2 font-mono text-sm",
                        true
                          ? "border-zinc-800 bg-zinc-950 text-zinc-200"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800"
                      )}
                    >
                      {server.node.sftpPort}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(server.node!.sftpPort.toString());
                        toast.success("Port copied to clipboard");
                      }}
                      className={cn(
                        true
                          ? "border-zinc-700 hover:bg-zinc-800"
                          : "border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <BsClipboard className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      "text-zinc-500"
                    )}
                  >
                    Username
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "flex-1 rounded border px-3 py-2 font-mono text-sm",
                        true
                          ? "border-zinc-800 bg-zinc-950 text-zinc-200"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800"
                      )}
                    >
                      {server.id}.{user.email}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${server.id}.${user.email}`);
                        toast.success("Username copied to clipboard");
                      }}
                      className={cn(
                        true
                          ? "border-zinc-700 hover:bg-zinc-800"
                          : "border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <BsClipboard className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      "text-zinc-500"
                    )}
                  >
                    Password
                  </label>
                  <div className="mt-1">
                    <div
                      className={cn(
                        "rounded border px-3 py-2 text-sm",
                        true
                          ? "border-zinc-800 bg-zinc-950 text-zinc-400"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600"
                      )}
                    >
                      Your account password
                    </div>
                  </div>
                </div>

                {/* Connection String */}
                <div>
                  <label
                    className={cn(
                      "text-xs font-medium tracking-wider uppercase",
                      "text-zinc-500"
                    )}
                  >
                    Connection String
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "flex-1 rounded border px-3 py-2 font-mono text-sm break-all whitespace-normal",
                        true
                          ? "border-zinc-800 bg-zinc-950 text-zinc-200"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800"
                      )}
                    >
                      sftp://{server.id}.{user.email}@{server.node.host}:{server.node.sftpPort}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (server.node) {
                          navigator.clipboard.writeText(
                            `sftp://${server.id}.${user.email}@${server.node.host}:${server.node.sftpPort}`
                          );
                          toast.success("Connection string copied to clipboard");
                        }
                      }}
                      className={cn(
                        true
                          ? "border-zinc-700 hover:bg-zinc-800"
                          : "border-zinc-300 hover:bg-zinc-100"
                      )}
                    >
                      <BsClipboard className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div
                className={cn(
                  "mt-6 rounded border p-4",
                  "border-zinc-800 bg-zinc-950/50"
                )}
              >
                <h4
                  className={cn(
                    "mb-2 text-sm font-semibold",
                    "text-zinc-300"
                  )}
                >
                  Popular SFTP Clients:
                </h4>
                <ul
                  className={cn(
                    "list-inside list-disc space-y-1 text-sm",
                    "text-zinc-400"
                  )}
                >
                  <li>FileZilla (Windows, macOS, Linux)</li>
                  <li>WinSCP (Windows)</li>
                  <li>Cyberduck (Windows, macOS)</li>
                  <li>Transmit (macOS)</li>
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Permissions Editor Modal */}
      <Dialog open={permissionsModalOpen} onOpenChange={setPermissionsModalOpen}>
        <DialogContent
          className={cn(
            "max-w-md",
            "border-zinc-800 bg-zinc-900"
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn("text-lg font-semibold", "text-zinc-100")}
            >
              Edit Permissions
            </DialogTitle>
            <DialogDescription
              className={cn("text-sm", "text-zinc-400")}
            >
              {fileToEditPermissions
                ? `Change permissions for "${fileToEditPermissions.name}"`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {fileToEditPermissions && (
            <div className="mt-4 space-y-4">
              {/* Permission Grid */}
              <div
                className={cn(
                  "overflow-hidden rounded border",
                  "border-zinc-800"
                )}
              >
                {/* Header Row */}
                <div
                  className={cn(
                    "grid grid-cols-4 border-b text-xs font-semibold tracking-wider uppercase",
                    true
                      ? "border-zinc-800 bg-zinc-950 text-zinc-400"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  )}
                >
                  <div className="p-3"></div>
                  <div className="p-3 text-center">Read</div>
                  <div className="p-3 text-center">Write</div>
                  <div className="p-3 text-center">Execute</div>
                </div>

                {/* Owner Row */}
                <div
                  className={cn(
                    "grid grid-cols-4 border-b",
                    "border-zinc-800"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 text-sm font-medium",
                      "text-zinc-300"
                    )}
                  >
                    Owner
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.owner.read}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          owner: { ...p.owner, read: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.owner.write}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          owner: { ...p.owner, write: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.owner.execute}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          owner: { ...p.owner, execute: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                </div>

                {/* Group Row */}
                <div
                  className={cn(
                    "grid grid-cols-4 border-b",
                    "border-zinc-800"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 text-sm font-medium",
                      "text-zinc-300"
                    )}
                  >
                    Group
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.group.read}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          group: { ...p.group, read: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.group.write}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          group: { ...p.group, write: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.group.execute}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          group: { ...p.group, execute: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                </div>

                {/* Others Row */}
                <div className="grid grid-cols-4">
                  <div
                    className={cn(
                      "p-3 text-sm font-medium",
                      "text-zinc-300"
                    )}
                  >
                    Others
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.others.read}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          others: { ...p.others, read: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.others.write}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          others: { ...p.others, write: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                  <div className="flex justify-center p-3">
                    <Checkbox
                      checked={permissions.others.execute}
                      onCheckedChange={(checked) =>
                        setPermissions((p) => ({
                          ...p,
                          others: { ...p.others, execute: checked as boolean },
                        }))
                      }
                      className={cn("border-zinc-700")}
                    />
                  </div>
                </div>
              </div>

              {/* Octal Preview */}
              <div
                className={cn(
                  "rounded border p-4",
                  "border-zinc-800 bg-zinc-950/50"
                )}
              >
                <div
                  className={cn(
                    "mb-2 text-xs font-medium tracking-wider uppercase",
                    "text-zinc-500"
                  )}
                >
                  Octal Representation
                </div>
                <code
                  className={cn("font-mono text-lg", "text-zinc-200")}
                >
                  {(permissions.owner.read ? 4 : 0) +
                    (permissions.owner.write ? 2 : 0) +
                    (permissions.owner.execute ? 1 : 0)}
                  {(permissions.group.read ? 4 : 0) +
                    (permissions.group.write ? 2 : 0) +
                    (permissions.group.execute ? 1 : 0)}
                  {(permissions.others.read ? 4 : 0) +
                    (permissions.others.write ? 2 : 0) +
                    (permissions.others.execute ? 1 : 0)}
                </code>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPermissionsModalOpen(false)}
                  className={cn(
                    "border-zinc-700 hover:bg-zinc-800"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmPermissions}
                  className={cn(
                    "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                  )}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <FormModal
        open={uploadModalOpen}
        onOpenChange={(open) => {
          if (!isUploading) {
            setUploadModalOpen(open);
            if (!open) setUploadFiles([]);
          }
        }}
        title="Upload Files"
        description="Upload files to the current directory."
        onSubmit={confirmUpload}
        submitLabel={isUploading ? "Uploading..." : "Upload"}
        isValid={uploadFiles.length > 0 && !isUploading}
      >
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className={cn(
              "relative border-2 border-dashed p-8 text-center transition-colors",
              true
                ? "border-zinc-700 bg-zinc-900/30 hover:border-zinc-500"
                : "border-zinc-300 bg-zinc-50 hover:border-zinc-400"
            )}
          >
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <BsCloudUpload
              className={cn("mx-auto mb-3 h-10 w-10", "text-zinc-600")}
            />
            <p className={cn("text-sm", "text-zinc-400")}>
              Drag and drop files here, or click to browse
            </p>
            <p className={cn("mt-1 text-xs", "text-zinc-600")}>
              Text files only (binary uploads coming soon)
            </p>
          </div>

          {/* File list */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2">
              <p
                className={cn(
                  "text-xs tracking-wider uppercase",
                  "text-zinc-500"
                )}
              >
                {uploadFiles.length} file(s) selected
              </p>
              <div
                className={cn(
                  "max-h-40 overflow-y-auto border",
                  "border-zinc-800"
                )}
              >
                {uploadFiles.map((file, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center justify-between px-3 py-2",
                      index !== uploadFiles.length - 1 &&
                        ("border-b border-zinc-800")
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <BsFileEarmark
                        className={cn(
                          "h-4 w-4 shrink-0",
                          "text-zinc-500"
                        )}
                      />
                      <span
                        className={cn(
                          "truncate text-sm",
                          "text-zinc-300"
                        )}
                      >
                        {file.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          "text-zinc-600"
                        )}
                      >
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUploadFile(index)}
                      disabled={isUploading}
                      className={cn(
                        "p-1 transition-colors",
                        true
                          ? "text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                          : "text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                      )}
                    >
                      <BsX className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload progress */}
          {isUploading && (
            <div className="flex items-center justify-center gap-3 py-2">
              <Spinner className={cn("h-4 w-4", "text-zinc-400")} />
              <span className={cn("text-sm", "text-zinc-400")}>
                Uploading files...
              </span>
            </div>
          )}
        </div>
      </FormModal>
    </div>
  );
};

export default FilesPage;

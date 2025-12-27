"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme as useNextTheme } from "next-themes";
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
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { FormModal } from "@workspace/ui/components/shared/FormModal";
import { Spinner } from "@workspace/ui/components/spinner";
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
} from "react-icons/bs";
import { servers } from "@/lib/api";
import type { FileInfo } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { toast } from "sonner";

interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  size: string;
  sizeBytes: number;
  modified: string;
  path: string;
}

const EDITABLE_EXTENSIONS = [".yml", ".yaml", ".json", ".txt", ".properties", ".conf", ".cfg", ".ini", ".log", ".md", ".sh", ".bat", ".toml"];

const FilesPage = (): JSX.Element | null => {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const pathSegments = params.path as string[] | undefined;
  const { server } = useServer();

  // Derive current path from URL params
  const currentPath = pathSegments && pathSegments.length > 0
    ? "/" + pathSegments.join("/")
    : "/";

  const { setTheme, resolvedTheme } = useNextTheme();
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
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  const [diskUsage, setDiskUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 });

  // Storage info - total from server allocation, used from actual disk usage
  const storageUsedGB = diskUsage.used / (1024 * 1024 * 1024);
  const storageTotalGB = server ? server.disk / 1024 : 10; // server.disk is in MB
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
      setDiskUsage({ used: usage.used_bytes, total: server?.disk ? server.disk * 1024 * 1024 : 0 });
    } catch {
      // Silently fail - disk usage is not critical
    }
  }, [serverId, server?.disk]);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await servers.files.list(serverId, currentPath === "/" ? undefined : currentPath);
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
          const filePath = currentPath === "/"
            ? `/${file.name}`
            : `${currentPath}/${file.name}`;
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
        setFiles(prev => {
          const existingPaths = new Set(prev.map(f => f.path));
          const uniqueNewFiles = newFiles.filter(f => !existingPaths.has(f.path));
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
      toast.error("Failed to upload files", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Navigation helpers
  const navigateToFolder = (folderName: string) => {
    const newPath = currentPath === "/"
      ? `/${folderName}`
      : `${currentPath}/${folderName}`;
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
    return EDITABLE_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext));
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
      setFiles(prev => prev.filter(f => f.path !== deletePath));
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
      await Promise.all(selectedIds.map(path => servers.files.delete(serverId, path)));
      // Optimistically remove from list
      setFiles(prev => prev.filter(f => !selectedIds.includes(f.path)));
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
    const newPath = currentPath === "/"
      ? `/${newFileName.trim()}`
      : `${currentPath}/${newFileName.trim()}`;
    const newName = newFileName.trim();
    try {
      await servers.files.rename(serverId, oldPath, newPath);
      // Optimistically update the file in list
      setFiles(prev => prev.map(f =>
        f.path === oldPath
          ? { ...f, name: newName, path: newPath, id: newPath }
          : f
      ));
      toast.success("File renamed");
    } catch (error) {
      toast.error("Failed to rename file");
    } finally {
      setRenameModalOpen(false);
      setFileToRename(null);
      setNewFileName("");
    }
  };

  const handleNewFolder = () => {
    setNewFolderName("");
    setNewFolderModalOpen(true);
  };

  const confirmNewFolder = async () => {
    if (!newFolderName.trim()) return;
    const folderPath = currentPath === "/"
      ? `/${newFolderName.trim()}`
      : `${currentPath}/${newFolderName.trim()}`;
    const folderName = newFolderName.trim();
    try {
      await servers.files.create(serverId, folderPath, "directory");
      // Optimistically add folder to list
      setFiles(prev => [...prev, {
        id: folderPath,
        name: folderName,
        type: "folder",
        size: "--",
        sizeBytes: 0,
        modified: new Date().toLocaleString(),
        path: folderPath,
      }]);
      toast.success("Folder created");
    } catch (error) {
      toast.error("Failed to create folder");
    } finally {
      setNewFolderModalOpen(false);
      setNewFolderName("");
    }
  };

  const handleEdit = async (file: FileItem) => {
    setFileToEdit(file);
    setIsLoadingContent(true);
    setEditorModalOpen(true);
    try {
      const content = await servers.files.read(serverId, file.path);
      setFileContent(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    } catch (error) {
      toast.error("Failed to load file content");
      setFileContent("");
    } finally {
      setIsLoadingContent(false);
    }
  };

  const confirmSaveFile = async () => {
    if (!fileToEdit) return;
    setIsSaving(true);
    try {
      await servers.files.write(serverId, fileToEdit.path, fileContent);
      toast.success("File saved");
      setEditorModalOpen(false);
      setFileToEdit(null);
      setFileContent("");
    } catch (error) {
      toast.error("Failed to save file");
    } finally {
      setIsSaving(false);
    }
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
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const confirmUpload = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    const newFiles: FileItem[] = [];
    try {
      for (const file of uploadFiles) {
        const content = await file.text();
        const filePath = currentPath === "/"
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;
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
      }
      // Optimistically add new files
      if (newFiles.length > 0) {
        setFiles(prev => {
          const existingPaths = new Set(prev.map(f => f.path));
          const uniqueNewFiles = newFiles.filter(f => !existingPaths.has(f.path));
          return [...prev, ...uniqueNewFiles];
        });
      }
      toast.success(`Uploaded ${uploadFiles.length} file(s)`);
      setUploadModalOpen(false);
      setUploadFiles([]);
      fetchDiskUsage();
    } catch (error) {
      toast.error("Failed to upload files");
    } finally {
      setIsUploading(false);
    }
  };

  const columns: ColumnDef<FileItem>[] = useMemo(() => [
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
            isDark ? "data-[state=checked]:bg-zinc-600" : "data-[state=checked]:bg-zinc-400"
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
            isDark ? "data-[state=checked]:bg-zinc-600" : "data-[state=checked]:bg-zinc-400"
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
            className={cn("flex items-center gap-2 transition-colors", isDark ? "hover:text-zinc-100" : "hover:text-zinc-900")}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Name
            {column.getIsSorted() === "asc" ? (
              <BsChevronUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <BsChevronDown className="w-3 h-3" />
            ) : (
              <BsChevronExpand className="w-3 h-3 opacity-50" />
            )}
          </button>
        );
      },
      cell: ({ row }) => {
        const file = row.original;
        return (
          <div className="flex items-center gap-3">
            {file.type === "folder" ? (
              <BsFolder className={cn("w-4 h-4", isDark ? "text-amber-400" : "text-amber-600")} />
            ) : (
              <BsFileEarmark className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
            )}
            <span
              className={cn(
                "cursor-pointer hover:underline",
                isDark ? "text-zinc-200" : "text-zinc-700"
              )}
              onClick={() => {
                if (file.type === "folder") {
                  navigateToFolder(file.name);
                }
              }}
              onDoubleClick={() => {
                if (file.type === "file" && isEditable(file.name)) {
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
            className={cn("flex items-center gap-2 transition-colors", isDark ? "hover:text-zinc-100" : "hover:text-zinc-900")}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Size
            {column.getIsSorted() === "asc" ? (
              <BsChevronUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <BsChevronDown className="w-3 h-3" />
            ) : (
              <BsChevronExpand className="w-3 h-3 opacity-50" />
            )}
          </button>
        );
      },
      cell: ({ row }) => (
        <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
          {row.getValue("size")}
        </span>
      ),
    },
    {
      accessorKey: "modified",
      header: ({ column }) => {
        return (
          <button
            className={cn("flex items-center gap-2 transition-colors", isDark ? "hover:text-zinc-100" : "hover:text-zinc-900")}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Modified
            {column.getIsSorted() === "asc" ? (
              <BsChevronUp className="w-3 h-3" />
            ) : column.getIsSorted() === "desc" ? (
              <BsChevronDown className="w-3 h-3" />
            ) : (
              <BsChevronExpand className="w-3 h-3 opacity-50" />
            )}
          </button>
        );
      },
      cell: ({ row }) => (
        <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
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
                  isDark ? "text-zinc-500 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-700"
                )}
              >
                <BsThreeDotsVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={cn(
                "min-w-[160px]",
                isDark ? "bg-zinc-900 border-zinc-700" : "bg-white border-zinc-200"
              )}
            >
              <DropdownMenuItem
                onClick={() => handleRename(file)}
                className={cn(
                  "gap-2 text-xs uppercase tracking-wider cursor-pointer",
                  isDark ? "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" : "text-zinc-700 focus:bg-zinc-100"
                )}
              >
                <BsPencil className="w-3 h-3" />
                Rename
              </DropdownMenuItem>
              {file.type === "file" && isEditable(file.name) && (
                <DropdownMenuItem
                  onClick={() => handleEdit(file)}
                  className={cn(
                    "gap-2 text-xs uppercase tracking-wider cursor-pointer",
                    isDark ? "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" : "text-zinc-700 focus:bg-zinc-100"
                  )}
                >
                  <BsFileText className="w-3 h-3" />
                  Edit
                </DropdownMenuItem>
              )}
              {file.type === "file" && (
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const { downloadUrl } = await servers.files.getDownloadToken(serverId, file.path);
                      window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}${downloadUrl}`, "_blank");
                    } catch (error) {
                      toast.error("Failed to generate download link");
                    }
                  }}
                  className={cn(
                    "gap-2 text-xs uppercase tracking-wider cursor-pointer",
                    isDark ? "text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100" : "text-zinc-700 focus:bg-zinc-100"
                  )}
                >
                  <BsDownload className="w-3 h-3" />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className={isDark ? "bg-zinc-700" : "bg-zinc-200"} />
              <DropdownMenuItem
                onClick={() => handleDelete(file)}
                className={cn(
                  "gap-2 text-xs uppercase tracking-wider cursor-pointer",
                  isDark ? "text-red-400 focus:bg-red-950/50 focus:text-red-300" : "text-red-600 focus:bg-red-50"
                )}
              >
                <BsTrash className="w-3 h-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [isDark, currentPath, serverId]);

  const table = useReactTable({
    data: files,
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

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <SidebarTrigger className={cn(
                "transition-all hover:scale-110 active:scale-95",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )} />
              <div>
                <h1 className={cn(
                  "text-2xl font-light tracking-wider",
                  isDark ? "text-zinc-100" : "text-zinc-800"
                )}>
                  FILE MANAGER
                </h1>
                {/* Breadcrumb Navigation */}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className={cn(
                    "text-sm",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    {server?.name || `Server ${serverId}`} -
                  </span>
                  <Link
                    href={getBasePath()}
                    className={cn(
                      "text-sm hover:underline transition-colors",
                      currentPath === "/"
                        ? isDark ? "text-zinc-300" : "text-zinc-700"
                        : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    /
                  </Link>
                  {breadcrumbSegments.map((segment, index) => {
                    const pathUpToHere = "/" + breadcrumbSegments.slice(0, index + 1).join("/");
                    const isLast = index === breadcrumbSegments.length - 1;
                    return (
                      <span key={pathUpToHere} className="flex items-center gap-1">
                        <span className={cn("text-sm", isDark ? "text-zinc-600" : "text-zinc-400")}>/</span>
                        {isLast ? (
                          <span className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                            {segment}
                          </span>
                        ) : (
                          <Link
                            href={`${getBasePath()}${pathUpToHere}`}
                            className={cn(
                              "text-sm hover:underline transition-colors",
                              isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "transition-all hover:scale-110 active:scale-95 p-2",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
              )}
            >
              {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
            </Button>
          </div>

          {/* Storage Indicator */}
          <div className={cn(
            "relative p-4 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <div className="flex items-center gap-4">
              <BsHddFill className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-500")} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className={cn("text-xs uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    Storage
                  </span>
                  <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    {storageUsedGB.toFixed(2)} GB / {storageTotalGB.toFixed(1)} GB
                  </span>
                </div>
                <div className={cn("h-2 w-full", isDark ? "bg-zinc-800" : "bg-zinc-200")}>
                  <div
                    className={cn(
                      "h-full transition-all",
                      storagePercentage > 90 ? "bg-red-500" : storagePercentage > 70 ? "bg-amber-500" : "bg-green-500"
                    )}
                    style={{ width: `${Math.min(100, storagePercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className={cn(
            "relative p-4 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPath === "/"}
                  onClick={navigateUp}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-30"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-30"
                  )}
                >
                  <BsArrowLeft className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Back</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewFolder}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                  )}
                >
                  <BsPlus className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">New Folder</span>
                </Button>
                {selectedCount > 0 && (
                  <span className={cn(
                    "text-xs ml-2",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    {selectedCount} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUploadClick}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                  )}
                >
                  <BsUpload className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Upload</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0}
                  onClick={handleBulkDelete}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700 disabled:opacity-30"
                      : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400 disabled:opacity-30"
                  )}
                >
                  <BsTrash className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Delete</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className={cn(
            "relative border",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className={cn(
                      "border-b",
                      isDark ? "border-zinc-700/50 hover:bg-transparent" : "border-zinc-200 hover:bg-transparent"
                    )}
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "text-[10px] font-medium uppercase tracking-wider px-4",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
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
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      )}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Spinner className="w-4 h-4" />
                        Loading files...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => (
                        <motion.tr
                          key={row.original.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20, scale: 0.95 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          data-state={row.getIsSelected() && "selected"}
                          className={cn(
                            "border-b cursor-pointer transition-colors",
                            isDark
                              ? "border-zinc-800/50 hover:bg-zinc-800/30 data-[state=selected]:bg-zinc-800/50"
                              : "border-zinc-100 hover:bg-zinc-100/50 data-[state=selected]:bg-zinc-200/50"
                          )}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="px-4 py-3">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </motion.tr>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className={cn(
                            "h-24 text-center text-sm",
                            isDark ? "text-zinc-500" : "text-zinc-400"
                          )}
                        >
                          No files found.
                        </TableCell>
                      </TableRow>
                    )}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className={cn(
            "mt-4 text-xs",
            isDark ? "text-zinc-600" : "text-zinc-400"
          )}>
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
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            {/* Backdrop */}
            <div className={cn(
              "absolute inset-0",
              isDark ? "bg-black/80" : "bg-white/80"
            )} />

            {/* Drop zone indicator */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "relative border-4 border-dashed rounded-lg p-16 text-center",
                isDark
                  ? "border-zinc-500 bg-zinc-900/90"
                  : "border-zinc-400 bg-white/90"
              )}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <BsCloudUpload className={cn(
                  "w-16 h-16 mx-auto mb-4",
                  isDark ? "text-zinc-400" : "text-zinc-500"
                )} />
              </motion.div>
              <p className={cn(
                "text-xl font-light tracking-wider",
                isDark ? "text-zinc-200" : "text-zinc-700"
              )}>
                DROP FILES TO UPLOAD
              </p>
              <p className={cn(
                "text-sm mt-2",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
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
        isDark={isDark}
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
        isDark={isDark}
      />

      {/* Rename Modal */}
      <FormModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        title="Rename"
        description={`Enter a new name for "${fileToRename?.name}"`}
        submitLabel="Rename"
        onSubmit={confirmRename}
        isDark={isDark}
        isValid={newFileName.trim().length > 0}
      >
        <input
          type="text"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          placeholder="Enter new name"
          className={cn(
            "w-full px-3 py-2 text-sm border outline-none transition-colors",
            isDark
              ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500 placeholder:text-zinc-600"
              : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400 placeholder:text-zinc-400"
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
        isDark={isDark}
        isValid={newFolderName.trim().length > 0}
      >
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="Folder name"
          className={cn(
            "w-full px-3 py-2 text-sm border outline-none transition-colors",
            isDark
              ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500 placeholder:text-zinc-600"
              : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400 placeholder:text-zinc-400"
          )}
        />
      </FormModal>

      {/* File Editor Modal */}
      <FormModal
        open={editorModalOpen}
        onOpenChange={(open) => {
          if (!isSaving) {
            setEditorModalOpen(open);
            if (!open) {
              setFileToEdit(null);
              setFileContent("");
            }
          }
        }}
        title={`Edit: ${fileToEdit?.name || ""}`}
        submitLabel={isSaving ? "Saving..." : "Save"}
        onSubmit={confirmSaveFile}
        isDark={isDark}
        size="xl"
        isValid={!isLoadingContent && !isSaving}
      >
        {isLoadingContent ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-6 h-6" />
          </div>
        ) : (
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            rows={20}
            spellCheck={false}
            className={cn(
              "w-full px-3 py-2 text-sm font-mono border outline-none transition-colors resize-none",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
            )}
          />
        )}
      </FormModal>

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
        isDark={isDark}
        isValid={uploadFiles.length > 0 && !isUploading}
      >
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className={cn(
              "relative border-2 border-dashed p-8 text-center transition-colors",
              isDark
                ? "border-zinc-700 hover:border-zinc-500 bg-zinc-900/30"
                : "border-zinc-300 hover:border-zinc-400 bg-zinc-50"
            )}
          >
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <BsCloudUpload className={cn(
              "w-10 h-10 mx-auto mb-3",
              isDark ? "text-zinc-600" : "text-zinc-400"
            )} />
            <p className={cn(
              "text-sm",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Drag and drop files here, or click to browse
            </p>
            <p className={cn(
              "text-xs mt-1",
              isDark ? "text-zinc-600" : "text-zinc-400"
            )}>
              Text files only (binary uploads coming soon)
            </p>
          </div>

          {/* File list */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2">
              <p className={cn(
                "text-xs uppercase tracking-wider",
                isDark ? "text-zinc-500" : "text-zinc-500"
              )}>
                {uploadFiles.length} file(s) selected
              </p>
              <div className={cn(
                "max-h-40 overflow-y-auto border",
                isDark ? "border-zinc-800" : "border-zinc-200"
              )}>
                {uploadFiles.map((file, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center justify-between px-3 py-2",
                      index !== uploadFiles.length - 1 && (isDark ? "border-b border-zinc-800" : "border-b border-zinc-200")
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <BsFileEarmark className={cn(
                        "w-4 h-4 shrink-0",
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      )} />
                      <span className={cn(
                        "text-sm truncate",
                        isDark ? "text-zinc-300" : "text-zinc-700"
                      )}>
                        {file.name}
                      </span>
                      <span className={cn(
                        "text-xs shrink-0",
                        isDark ? "text-zinc-600" : "text-zinc-400"
                      )}>
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUploadFile(index)}
                      disabled={isUploading}
                      className={cn(
                        "p-1 transition-colors",
                        isDark
                          ? "text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                          : "text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                      )}
                    >
                      <BsX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload progress */}
          {isUploading && (
            <div className="flex items-center justify-center gap-3 py-2">
              <Spinner className={cn(
                "w-4 h-4",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )} />
              <span className={cn(
                "text-sm",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
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

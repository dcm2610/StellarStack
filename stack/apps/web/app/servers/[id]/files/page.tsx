"use client";

import { useState, useEffect, useMemo, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
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
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
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
} from "react-icons/bs";

interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file";
  size: string;
  modified: string;
}

const mockFiles: FileItem[] = [
  { id: "1", name: "server.properties", type: "file", size: "2.4 KB", modified: "2024-01-15 14:30" },
  { id: "2", name: "world", type: "folder", size: "--", modified: "2024-01-15 12:00" },
  { id: "3", name: "plugins", type: "folder", size: "--", modified: "2024-01-14 18:45" },
  { id: "4", name: "logs", type: "folder", size: "--", modified: "2024-01-15 14:32" },
  { id: "5", name: "config.yml", type: "file", size: "8.1 KB", modified: "2024-01-13 09:20" },
  { id: "6", name: "whitelist.json", type: "file", size: "512 B", modified: "2024-01-10 16:00" },
  { id: "7", name: "banned-players.json", type: "file", size: "128 B", modified: "2024-01-08 11:30" },
  { id: "8", name: "ops.json", type: "file", size: "256 B", modified: "2024-01-05 20:15" },
  { id: "9", name: "server.jar", type: "file", size: "45.2 MB", modified: "2024-01-01 10:00" },
  { id: "10", name: "eula.txt", type: "file", size: "64 B", modified: "2024-01-01 10:00" },
];

const FilesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

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
            className="flex items-center gap-2 hover:text-zinc-100 transition-colors"
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
              onDoubleClick={() => {
                if (file.type === "folder") {
                  setCurrentPath(`${currentPath}${file.name}/`);
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
            className="flex items-center gap-2 hover:text-zinc-100 transition-colors"
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
            className="flex items-center gap-2 hover:text-zinc-100 transition-colors"
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
  ], [isDark, currentPath]);

  const table = useReactTable({
    data: mockFiles,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
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
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • {currentPath}
                </p>
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

          {/* Toolbar */}
          <div className={cn(
            "relative p-4 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            {/* Corner decorations */}
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
                  onClick={() => {
                    const parts = currentPath.split("/").filter(Boolean);
                    parts.pop();
                    setCurrentPath(parts.length ? `/${parts.join("/")}/` : "/");
                  }}
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
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-30"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-30"
                  )}
                >
                  <BsDownload className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-wider">Download</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedCount === 0}
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
            {/* Corner decorations */}
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
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
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
                    </TableRow>
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
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className={cn(
            "mt-4 text-xs",
            isDark ? "text-zinc-600" : "text-zinc-400"
          )}>
            {table.getFilteredRowModel().rows.length} file(s) • {selectedCount} selected
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilesPage;

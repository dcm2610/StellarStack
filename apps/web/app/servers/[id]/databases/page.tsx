"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import {
  BsSun,
  BsMoon,
  BsPlus,
  BsTrash,
  BsEye,
  BsEyeSlash,
  BsClipboard,
  BsExclamationTriangle,
} from "react-icons/bs";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";

interface Database {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  size: string;
  connections: number;
  maxConnections: number;
}

const mockDatabases: Database[] = [
  {
    id: "db-1",
    name: "minecraft_data",
    host: "localhost",
    port: 3306,
    username: "mc_user",
    password: "••••••••",
    size: "256 MB",
    connections: 5,
    maxConnections: 50,
  },
  {
    id: "db-2",
    name: "player_stats",
    host: "localhost",
    port: 3306,
    username: "stats_user",
    password: "••••••••",
    size: "128 MB",
    connections: 2,
    maxConnections: 25,
  },
];

const generatePassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const DatabasesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [databases, setDatabases] = useState<Database[]>(mockDatabases);
  const [visiblePasswords, setVisiblePasswords] = useState<string[]>([]);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState<Database | null>(null);

  // Form states
  const [formName, setFormName] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  const openCreateModal = () => {
    setFormName("");
    setCreateModalOpen(true);
  };

  const openDeleteModal = (db: Database) => {
    setSelectedDb(db);
    setDeleteModalOpen(true);
  };

  const handleCreate = () => {
    const newDb: Database = {
      id: `db-${Date.now()}`,
      name: formName.toLowerCase().replace(/\s+/g, "_"),
      host: "localhost",
      port: 3306,
      username: `${formName.toLowerCase().replace(/\s+/g, "_")}_user`,
      password: generatePassword(),
      size: "0 MB",
      connections: 0,
      maxConnections: 25,
    };
    setDatabases((prev) => [...prev, newDb]);
    setCreateModalOpen(false);
    setFormName("");
  };

  const handleDelete = () => {
    if (!selectedDb) return;
    setDatabases((prev) => prev.filter((d) => d.id !== selectedDb.id));
    setDeleteModalOpen(false);
    setSelectedDb(null);
  };

  const togglePassword = (id: string) => {
    setVisiblePasswords((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isNameValid = formName.trim().length >= 3;

  return (
    <div className="relative min-h-full transition-colors">
      {/* Background is now rendered in the layout for persistence */}

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}
                >
                  DATABASES
                </h1>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Server {serverId} • {databases.length} databases
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateModal}
                className={cn(
                  "gap-2 transition-all",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                <BsPlus className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">New Database</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "p-2 transition-all hover:scale-110 active:scale-95",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                {isDark ? <BsSun className="h-4 w-4" /> : <BsMoon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Development Notice */}
          <div
            className={cn(
              "mb-6 flex items-center gap-3 border p-4",
              isDark
                ? "border-amber-700/30 bg-amber-950/20 text-amber-200/80"
                : "border-amber-200 bg-amber-50 text-amber-800"
            )}
          >
            <BsExclamationTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Under Development</p>
              <p className={cn("mt-0.5 text-xs", isDark ? "text-amber-200/60" : "text-amber-600")}>
                Database management is not yet connected to the API. The data shown below is for
                demonstration purposes only.
              </p>
            </div>
          </div>

          {/* Database List */}
          <div className="space-y-4">
            {databases.map((db) => (
              <div
                key={db.id}
                className={cn(
                  "relative border p-6 transition-all",
                  isDark
                    ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                    : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
                )}
              >
                {/* Corner decorations */}
                <div
                  className={cn(
                    "absolute top-0 left-0 h-2 w-2 border-t border-l",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )}
                />
                <div
                  className={cn(
                    "absolute top-0 right-0 h-2 w-2 border-t border-r",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )}
                />
                <div
                  className={cn(
                    "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )}
                />
                <div
                  className={cn(
                    "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )}
                />

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-4 flex items-center gap-3">
                      <h3
                        className={cn(
                          "text-sm font-medium tracking-wider uppercase",
                          isDark ? "text-zinc-100" : "text-zinc-800"
                        )}
                      >
                        {db.name}
                      </h3>
                      <span
                        className={cn(
                          "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                          isDark
                            ? "border-green-500/50 text-green-400"
                            : "border-green-400 text-green-600"
                        )}
                      >
                        {db.connections}/{db.maxConnections} connections
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={cn(
                            "text-[10px] font-medium tracking-wider uppercase",
                            isDark ? "text-zinc-500" : "text-zinc-400"
                          )}
                        >
                          Host
                        </label>
                        <div
                          className={cn(
                            "mt-1 font-mono text-sm",
                            isDark ? "text-zinc-300" : "text-zinc-700"
                          )}
                        >
                          {db.host}:{db.port}
                        </div>
                      </div>
                      <div>
                        <label
                          className={cn(
                            "text-[10px] font-medium tracking-wider uppercase",
                            isDark ? "text-zinc-500" : "text-zinc-400"
                          )}
                        >
                          Size
                        </label>
                        <div
                          className={cn("mt-1 text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}
                        >
                          {db.size}
                        </div>
                      </div>
                      <div>
                        <label
                          className={cn(
                            "text-[10px] font-medium tracking-wider uppercase",
                            isDark ? "text-zinc-500" : "text-zinc-400"
                          )}
                        >
                          Username
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={cn(
                              "font-mono text-sm",
                              isDark ? "text-zinc-300" : "text-zinc-700"
                            )}
                          >
                            {db.username}
                          </span>
                          <button
                            onClick={() => copyToClipboard(db.username)}
                            className={cn(
                              "p-1 transition-colors",
                              isDark
                                ? "text-zinc-500 hover:text-zinc-300"
                                : "text-zinc-400 hover:text-zinc-600"
                            )}
                          >
                            <BsClipboard className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          className={cn(
                            "text-[10px] font-medium tracking-wider uppercase",
                            isDark ? "text-zinc-500" : "text-zinc-400"
                          )}
                        >
                          Password
                        </label>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={cn(
                              "font-mono text-sm",
                              isDark ? "text-zinc-300" : "text-zinc-700"
                            )}
                          >
                            {visiblePasswords.includes(db.id) ? db.password : "••••••••"}
                          </span>
                          <button
                            onClick={() => togglePassword(db.id)}
                            className={cn(
                              "p-1 transition-colors",
                              isDark
                                ? "text-zinc-500 hover:text-zinc-300"
                                : "text-zinc-400 hover:text-zinc-600"
                            )}
                          >
                            {visiblePasswords.includes(db.id) ? (
                              <BsEyeSlash className="h-3 w-3" />
                            ) : (
                              <BsEye className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(db.password)}
                            className={cn(
                              "p-1 transition-colors",
                              isDark
                                ? "text-zinc-500 hover:text-zinc-300"
                                : "text-zinc-400 hover:text-zinc-600"
                            )}
                          >
                            <BsClipboard className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteModal(db)}
                    className={cn(
                      "p-2 transition-all",
                      isDark
                        ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                        : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                    )}
                  >
                    <BsTrash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Database Modal */}
      <FormModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title="Create Database"
        description="Create a new MySQL database for your server."
        onSubmit={handleCreate}
        submitLabel="Create Database"
        isDark={isDark}
        isValid={isNameValid}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Database Name
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., player_data"
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
            <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Minimum 3 characters. Username and password will be auto-generated.
            </p>
          </div>
        </div>
      </FormModal>

      {/* Delete Database Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Database"
        description={`Are you sure you want to delete "${selectedDb?.name}"? All data in this database will be permanently lost.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="danger"
        isDark={isDark}
      />
    </div>
  );
};

export default DatabasesPage;

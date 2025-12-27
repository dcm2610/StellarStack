"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { MapPinIcon, PlusIcon, TrashIcon, EditIcon, ArrowLeftIcon } from "lucide-react";
import { locations } from "@/lib/api";
import type { Location, CreateLocationData } from "@/lib/api";
import { toast } from "sonner";

export default function LocationsPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateLocationData>({
    name: "",
    description: "",
    country: "",
    city: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const data = await locations.list();
      setLocationsList(data);
    } catch (error) {
      toast.error("Failed to fetch locations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      country: "",
      city: "",
    });
    setEditingLocation(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLocation) {
        await locations.update(editingLocation.id, formData);
        toast.success("Location updated successfully");
      } else {
        await locations.create(formData);
        toast.success("Location created successfully");
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editingLocation ? "Failed to update location" : "Failed to create location");
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      description: location.description || "",
      country: location.country || "",
      city: location.city || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (location: Location) => {
    if (!confirm(`Are you sure you want to delete "${location.name}"?`)) return;
    try {
      await locations.delete(location.id);
      toast.success("Location deleted successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete location");
    }
  };

  const inputClasses = cn(
    "w-full px-3 py-2 border text-sm transition-colors focus:outline-none",
    isDark
      ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500"
      : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400"
  );

  const labelClasses = cn(
    "block text-xs font-medium uppercase tracking-wider mb-1",
    isDark ? "text-zinc-400" : "text-zinc-600"
  );

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className={cn(
                    "p-2 transition-all hover:scale-110 active:scale-95",
                    isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}>
                    LOCATIONS
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    Manage geographic locations for nodes
                  </p>
                </div>
              </div>
              <Button
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className={cn(
                  "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                <PlusIcon className="w-4 h-4" />
                Add Location
              </Button>
            </div>
          </FadeIn>

          {/* Locations Grid */}
          <FadeIn delay={0.1}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className={cn("col-span-full text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
            Loading...
          </div>
        ) : locationsList.length === 0 ? (
          <div className={cn(
            "col-span-full text-center py-12 border",
            isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
          )}>
            No locations configured. Add your first location.
          </div>
        ) : (
          locationsList.map((location) => (
            <div
              key={location.id}
              className={cn(
                "relative p-4 border transition-colors",
                isDark
                  ? "bg-zinc-900/50 border-zinc-700/50"
                  : "bg-white border-zinc-200"
              )}
            >
              {/* Corner accents */}
              <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-blue-600" : "border-blue-400")} />
              <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-blue-600" : "border-blue-400")} />
              <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-blue-600" : "border-blue-400")} />
              <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-blue-600" : "border-blue-400")} />

              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <MapPinIcon className={cn("w-6 h-6 mt-0.5", isDark ? "text-blue-400" : "text-blue-600")} />
                  <div>
                    <div className={cn("font-medium", isDark ? "text-zinc-100" : "text-zinc-800")}>
                      {location.name}
                    </div>
                    {(location.city || location.country) && (
                      <div className={cn("text-xs mt-1", isDark ? "text-zinc-500" : "text-zinc-400")}>
                        {[location.city, location.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {location.description && (
                      <div className={cn("text-xs mt-2", isDark ? "text-zinc-600" : "text-zinc-400")}>
                        {location.description}
                      </div>
                    )}
                    {location.nodes && location.nodes.length > 0 && (
                      <div className={cn("text-xs mt-2", isDark ? "text-zinc-500" : "text-zinc-400")}>
                        {location.nodes.length} node{location.nodes.length !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(location)}
                    className={cn(
                      "text-xs p-1.5",
                      isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    <EditIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(location)}
                    className={cn(
                      "text-xs p-1.5",
                      isDark ? "border-red-900/50 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-600 hover:bg-red-50"
                    )}
                  >
                    <TrashIcon className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
              )}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn(
            "relative w-full max-w-md mx-4 p-6 border",
            isDark
              ? "bg-[#0f0f0f] border-zinc-700"
              : "bg-white border-zinc-300"
          )}>
            {/* Corner accents */}
            <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-lg font-light tracking-wider mb-6",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              {editingLocation ? "Edit Location" : "Create Location"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClasses}>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="US West"
                  className={inputClasses}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="US"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className={labelClasses}>City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Los Angeles"
                    className={inputClasses}
                  />
                </div>
              </div>

              <div>
                <label className={labelClasses}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  className={inputClasses}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsModalOpen(false); resetForm(); }}
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  {editingLocation ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

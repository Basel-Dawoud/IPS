import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBuildings } from "@/features/buildings/hooks";
import { useSessions } from "@/features/fingerprinting/hooks";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Fingerprint,
  Plus,
  Layers,
  Search,
  ArrowUpRight
} from "lucide-react";
import { resolveAssetUrl } from "@/lib/assets";

export function DashboardPage() {
  const navigate = useNavigate();

  // 1. Basic Stats Queries
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const { data: sessions, isLoading: sessionsLoading } = useSessions(undefined);

  // 2. Mutations (Moved to dedicated page /buildings/new)

  // 4. Searching & Filtering Buildings
  const [searchQuery, setSearchQuery] = useState("");
  const filteredBuildings = useMemo(() => {
    if (!buildings) return [];
    return buildings.filter(b => 
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [buildings, searchQuery]);

  // Aggregate stats
  const totalFloorsCount = useMemo(() => {
    if (!buildings) return 0;
    return buildings.reduce((acc, b) => acc + (b.floors?.length ?? 0), 0);
  }, [buildings]);



  return (
    <div className="space-y-6">
      {/* 1. Header Overview Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Overview Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Overview of your NaviMind indoor navigation system and active venues.
          </p>
        </div>
        <Button onClick={() => navigate("/buildings/new")} className="shadow-sm">
          <Plus className="mr-2 size-4" /> Add Building
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-md border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Buildings
            </CardTitle>
            <div className="rounded-md bg-primary/10 p-1.5">
              <Building2 className="size-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {buildingsLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold font-mono tracking-tight">{buildings?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-md border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Floor Levels
            </CardTitle>
            <div className="rounded-md bg-indigo-500/10 p-1.5">
              <Layers className="size-4 text-indigo-500" />
            </div>
          </CardHeader>
          <CardContent>
            {buildingsLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold font-mono tracking-tight">{totalFloorsCount}</p>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-md border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Fingerprint Sessions
            </CardTitle>
            <div className="rounded-md bg-emerald-500/10 p-1.5">
              <Fingerprint className="size-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold font-mono tracking-tight">{sessions?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 2. Building Grid Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Active Venues</h2>
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter by name or code..."
              className="pl-9 bg-card h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {buildingsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredBuildings.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl bg-card">
            <Building2 className="mx-auto size-12 text-muted-foreground/60 mb-3" />
            <h3 className="text-sm font-semibold">No buildings found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Create a new building or clear your search filter to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBuildings.map((building) => {
              const floorCount = building.floors?.length ?? 0;
              return (
                <Card
                  key={building.id}
                  className="group relative overflow-hidden bg-card border shadow-sm hover:shadow-md hover:border-muted-foreground/30 transition-all duration-200"
                >
                  <div className="h-32 bg-muted relative overflow-hidden">
                    {building.imageUrl ? (
                      <img
                        src={resolveAssetUrl(building.imageUrl) ?? ""}
                        alt={building.name}
                        className="size-full object-cover group-hover:scale-102 transition-transform duration-200"
                      />
                    ) : (
                      <div className="size-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted to-muted/40">
                        <Building2 className="size-8" />
                      </div>
                    )}
                    <Badge className="absolute top-3 right-3 font-mono text-xs bg-black/60 hover:bg-black/60 border-none">
                      {building.code}
                    </Badge>
                  </div>
                  
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-base leading-tight truncate text-foreground">
                        {building.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {building.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-1.5">
                        <Layers className="size-3.5" />
                        <strong>{floorCount}</strong> {floorCount === 1 ? "Level" : "Levels"}
                      </span>
                      
                      <Link to={`/buildings/${building.id}`}>
                        <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs text-primary group-hover:bg-primary/5">
                          Enter Workspace
                          <ArrowUpRight className="size-3.5 ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Building Create Flow is now handled on a dedicated page */}
    </div>
  );
}

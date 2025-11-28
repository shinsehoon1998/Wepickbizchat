import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Smartphone,
  Phone,
  MapPin,
  Navigation,
  Target,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Search,
  Loader2,
} from "lucide-react";
import { formatNumber } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Geofence } from "@shared/schema";

interface AtsMeta {
  categoryCode: string;
  categoryName: string;
  level: number;
  parentCode: string | null;
  metadata?: any;
}

interface AdvancedTargetingState {
  carrierTypes: string[];
  deviceTypes: string[];
  shopping11stCategories: string[];
  webappCategories: string[];
  callUsageTypes: string[];
  locationTypes: string[];
  mobilityPatterns: string[];
  geofenceIds: string[];
}

interface TargetingAdvancedProps {
  targeting: AdvancedTargetingState;
  onTargetingChange: (targeting: AdvancedTargetingState) => void;
  basicTargeting: {
    gender: string;
    ageMin: number;
    ageMax: number;
    regions: string[];
  };
}

function CategorySection({
  title,
  description,
  icon: Icon,
  categories,
  selectedCategories,
  onToggle,
  isLoading,
  testIdPrefix,
}: {
  title: string;
  description: string;
  icon: typeof ShoppingBag;
  categories: AtsMeta[];
  selectedCategories: string[];
  onToggle: (code: string) => void;
  isLoading: boolean;
  testIdPrefix: string;
}) {
  const [isOpen, setIsOpen] = useState(selectedCategories.length > 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedCategories.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">{title}</CardTitle>
                  <CardDescription className="text-small">{description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedCategories.length > 0 && (
                  <Badge variant="secondary">{selectedCategories.length}개 선택</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {categories.map((category) => (
                  <Label
                    key={category.categoryCode}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedCategories.includes(category.categoryCode)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                    data-testid={`${testIdPrefix}-${category.categoryCode}`}
                  >
                    <Checkbox
                      checked={selectedCategories.includes(category.categoryCode)}
                      onCheckedChange={() => onToggle(category.categoryCode)}
                    />
                    <span className="text-small">{category.categoryName}</span>
                  </Label>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function GeofenceSection({
  selectedGeofenceIds,
  onGeofenceChange,
}: {
  selectedGeofenceIds: string[];
  onGeofenceChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(selectedGeofenceIds.length > 0);
  const [poiSearch, setPoiSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: geofences, isLoading: geofencesLoading } = useQuery<Geofence[]>({
    queryKey: ["/api/geofences"],
  });

  const { data: poiResults, isLoading: poiLoading, refetch: searchPoi } = useQuery<{ pois: any[]; totalCount: number }>({
    queryKey: ["/api/maptics/poi", poiSearch],
    queryFn: async () => {
      if (!poiSearch) return { pois: [], totalCount: 0 };
      const res = await apiRequest("POST", "/api/maptics/poi", { keyword: poiSearch });
      return res.json();
    },
    enabled: false,
  });

  const handlePoiSearch = () => {
    if (poiSearch.trim()) {
      searchPoi();
    }
  };

  const handleCreateGeofence = async (poi: any) => {
    try {
      const response = await apiRequest("POST", "/api/geofences", {
        name: poi.name,
        latitude: poi.lat,
        longitude: poi.lng,
        radius: 500,
        poiId: poi.id,
        poiName: poi.name,
        poiCategory: poi.category,
      });
      const newGeofence = await response.json() as Geofence;
      queryClient.invalidateQueries({ queryKey: ["/api/geofences"] });
      onGeofenceChange([...selectedGeofenceIds, newGeofence.id]);
      setIsDialogOpen(false);
      setPoiSearch("");
    } catch (error) {
      console.error("Failed to create geofence:", error);
    }
  };

  const toggleGeofence = (id: string) => {
    if (selectedGeofenceIds.includes(id)) {
      onGeofenceChange(selectedGeofenceIds.filter((gId) => gId !== id));
    } else {
      onGeofenceChange([...selectedGeofenceIds, id]);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedGeofenceIds.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">위치 기반 타겟팅 (Maptics)</CardTitle>
                  <CardDescription className="text-small">
                    특정 위치 주변 고객 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedGeofenceIds.length > 0 && (
                  <Badge variant="secondary">{selectedGeofenceIds.length}개 지역</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {geofencesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : geofences && geofences.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-small text-muted-foreground">저장된 지오펜스</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {geofences.map((geofence) => (
                    <Label
                      key={geofence.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedGeofenceIds.includes(geofence.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      data-testid={`geofence-${geofence.id}`}
                    >
                      <Checkbox
                        checked={selectedGeofenceIds.includes(geofence.id)}
                        onCheckedChange={() => toggleGeofence(geofence.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-small truncate">{geofence.name}</div>
                        <div className="text-tiny text-muted-foreground">
                          반경 {geofence.radius}m
                        </div>
                      </div>
                    </Label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-small text-muted-foreground">
                저장된 지오펜스가 없어요
              </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full gap-2" data-testid="button-add-geofence">
                  <Plus className="h-4 w-4" />
                  새 지오펜스 추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>지오펜스 추가</DialogTitle>
                  <DialogDescription>
                    장소를 검색해서 타겟팅할 위치를 추가하세요
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="장소 검색 (예: 스타벅스, 이마트)"
                      value={poiSearch}
                      onChange={(e) => setPoiSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePoiSearch()}
                      data-testid="input-poi-search"
                    />
                    <Button onClick={handlePoiSearch} disabled={poiLoading}>
                      {poiLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {poiResults?.pois && poiResults.pois.length > 0 && (
                    <div className="space-y-2 max-h-[300px] overflow-auto">
                      {poiResults.pois.map((poi: any) => (
                        <div
                          key={poi.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 cursor-pointer"
                          onClick={() => handleCreateGeofence(poi)}
                          data-testid={`poi-result-${poi.id}`}
                        >
                          <div>
                            <div className="font-medium text-small">{poi.name}</div>
                            <div className="text-tiny text-muted-foreground">
                              {poi.category} · {poi.distance}m
                            </div>
                          </div>
                          <Plus className="h-4 w-4 text-primary" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function TargetingAdvanced({
  targeting,
  onTargetingChange,
  basicTargeting,
}: TargetingAdvancedProps) {
  const [estimatedCount, setEstimatedCount] = useState<number>(0);
  const [isEstimating, setIsEstimating] = useState(false);

  const { data: shopping11st, isLoading: shopping11stLoading } = useQuery<AtsMeta[]>({
    queryKey: ["/api/ats/meta/11st"],
  });

  const { data: webapp, isLoading: webappLoading } = useQuery<AtsMeta[]>({
    queryKey: ["/api/ats/meta/webapp"],
  });

  const { data: call, isLoading: callLoading } = useQuery<AtsMeta[]>({
    queryKey: ["/api/ats/meta/call"],
  });

  const { data: loc, isLoading: locLoading } = useQuery<AtsMeta[]>({
    queryKey: ["/api/ats/meta/loc"],
  });

  const { data: filter, isLoading: filterLoading } = useQuery<AtsMeta[]>({
    queryKey: ["/api/ats/meta/filter"],
  });

  const deviceCategories = filter?.filter((f) => f.metadata?.type === "device") || [];
  const carrierCategories = filter?.filter((f) => f.metadata?.type === "carrier") || [];

  const toggleCategory = (field: keyof AdvancedTargetingState, code: string) => {
    const current = targeting[field] as string[];
    if (current.includes(code)) {
      onTargetingChange({
        ...targeting,
        [field]: current.filter((c) => c !== code),
      });
    } else {
      onTargetingChange({
        ...targeting,
        [field]: [...current, code],
      });
    }
  };

  useEffect(() => {
    const estimateAudience = async () => {
      setIsEstimating(true);
      try {
        const res = await apiRequest("POST", "/api/ats/mosu", {
          ...basicTargeting,
          ...targeting,
        });
        const data = await res.json();
        setEstimatedCount(data.estimatedCount || 0);
      } catch (error) {
        console.error("Failed to estimate audience:", error);
      } finally {
        setIsEstimating(false);
      }
    };

    const debounce = setTimeout(estimateAudience, 500);
    return () => clearTimeout(debounce);
  }, [targeting, basicTargeting]);

  const hasAdvancedFilters =
    targeting.carrierTypes.length > 0 ||
    targeting.deviceTypes.length > 0 ||
    targeting.shopping11stCategories.length > 0 ||
    targeting.webappCategories.length > 0 ||
    targeting.callUsageTypes.length > 0 ||
    targeting.locationTypes.length > 0 ||
    targeting.mobilityPatterns.length > 0 ||
    targeting.geofenceIds.length > 0;

  const selectedFilters = [
    ...targeting.carrierTypes.map((c) => carrierCategories.find((cat) => cat.categoryCode === c)?.categoryName),
    ...targeting.deviceTypes.map((c) => deviceCategories.find((cat) => cat.categoryCode === c)?.categoryName),
    ...targeting.shopping11stCategories.map((c) => shopping11st?.find((cat) => cat.categoryCode === c)?.categoryName),
    ...targeting.webappCategories.map((c) => webapp?.find((cat) => cat.categoryCode === c)?.categoryName),
    ...targeting.callUsageTypes.map((c) => call?.find((cat) => cat.categoryCode === c)?.categoryName),
    ...targeting.locationTypes.map((c) => loc?.find((cat) => cat.categoryCode === c)?.categoryName),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            고급 타겟팅 (SK CoreTarget)
          </h3>
          <p className="text-small text-muted-foreground mt-1">
            SKT 빅데이터 기반 정밀 타겟팅으로 광고 효과를 높여보세요
          </p>
        </div>
        <div className="text-right">
          <div className="text-small text-muted-foreground">예상 타겟</div>
          <div className="text-h3 font-bold text-primary" data-testid="text-advanced-estimated">
            {isEstimating ? (
              <Loader2 className="h-5 w-5 animate-spin inline" />
            ) : (
              formatNumber(estimatedCount) + "명"
            )}
          </div>
        </div>
      </div>

      {hasAdvancedFilters && (
        <Card className="bg-accent/30">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-1.5">
              {selectedFilters.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-tiny">
                  {name}
                </Badge>
              ))}
              {targeting.geofenceIds.length > 0 && (
                <Badge variant="secondary" className="text-tiny">
                  지오펜스 {targeting.geofenceIds.length}개
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <CategorySection
          title="기기/회선 정보"
          description="통신사, 기기 종류로 타겟팅"
          icon={Smartphone}
          categories={[...deviceCategories, ...carrierCategories]}
          selectedCategories={[...targeting.deviceTypes, ...targeting.carrierTypes]}
          onToggle={(code) => {
            if (deviceCategories.some((c) => c.categoryCode === code)) {
              toggleCategory("deviceTypes", code);
            } else {
              toggleCategory("carrierTypes", code);
            }
          }}
          isLoading={filterLoading}
          testIdPrefix="filter"
        />

        <CategorySection
          title="11번가 쇼핑 행동"
          description="11번가 쇼핑 카테고리 관심사 기반"
          icon={ShoppingBag}
          categories={shopping11st || []}
          selectedCategories={targeting.shopping11stCategories}
          onToggle={(code) => toggleCategory("shopping11stCategories", code)}
          isLoading={shopping11stLoading}
          testIdPrefix="11st"
        />

        <CategorySection
          title="웹/앱 사용 패턴"
          description="자주 사용하는 앱 카테고리 기반"
          icon={Smartphone}
          categories={webapp || []}
          selectedCategories={targeting.webappCategories}
          onToggle={(code) => toggleCategory("webappCategories", code)}
          isLoading={webappLoading}
          testIdPrefix="webapp"
        />

        <CategorySection
          title="통화 사용 패턴"
          description="통화 빈도, 시간대 패턴 기반"
          icon={Phone}
          categories={call || []}
          selectedCategories={targeting.callUsageTypes}
          onToggle={(code) => toggleCategory("callUsageTypes", code)}
          isLoading={callLoading}
          testIdPrefix="call"
        />

        <CategorySection
          title="위치/이동 특성"
          description="생활 패턴, 이동 특성 기반"
          icon={Navigation}
          categories={loc || []}
          selectedCategories={targeting.locationTypes}
          onToggle={(code) => toggleCategory("locationTypes", code)}
          isLoading={locLoading}
          testIdPrefix="loc"
        />

        <GeofenceSection
          selectedGeofenceIds={targeting.geofenceIds}
          onGeofenceChange={(ids) => onTargetingChange({ ...targeting, geofenceIds: ids })}
        />
      </div>
    </div>
  );
}

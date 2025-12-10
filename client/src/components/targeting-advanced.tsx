import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Smartphone,
  MapPin,
  Target,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  X,
  Search,
  Loader2,
  TrendingUp,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// BizChat 카테고리 타입 (11st, webapp)
interface BizChatCategory {
  id: string;
  name: string;
  cateid: string;
}

interface BizChatCategoryResponse {
  metaType: string;
  dataType: string;
  list: BizChatCategory[];
}

// BizChat 위치 타입
interface BizChatLocation {
  hcode: string;
  ado: string;
  sigu: string;
  dong: string;
}

interface BizChatLocationResponse {
  list: BizChatLocation[];
  listR: BizChatLocation[];
}

// BizChat 필터 메타 타입
interface BizChatFilterAttribute {
  name: string;
  val: string;
  desc: string;
}

interface BizChatFilterMeta {
  name: string;
  desc: string;
  code: string;
  dataType: string;
  min: number;
  max: number;
  unit: string;
  attributes: BizChatFilterAttribute[];
}

interface BizChatFilterResponse {
  metaType: string;
  list: BizChatFilterMeta[];
}

// 선택된 카테고리 (ATS mosu 형식)
// cat1/cat2/cat3에는 cateid 코드를 저장, *Name에는 표시명을 저장
interface SelectedCategory {
  cat1: string;       // cateid 코드 (예: "01")
  cat1Name?: string;  // 표시명 (예: "가구/인테리어")
  cat2?: string;      // cateid 코드 (예: "0101")
  cat2Name?: string;  // 표시명
  cat3?: string;      // cateid 코드 (예: "010101")
  cat3Name?: string;  // 표시명
}

// 타겟팅 상태 (BizChat 규격 준수)
export interface AdvancedTargetingState {
  // 11번가 카테고리 (cat1/cat2/cat3 형식)
  shopping11stCategories: SelectedCategory[];
  // 웹앱 카테고리 (cat1/cat2/cat3 형식)
  webappCategories: SelectedCategory[];
  // 위치 필터 (hcode 배열)
  locations: {
    code: string;
    type: 'home' | 'work';
    name: string;
  }[];
  // 프로파일링 필터 (pro)
  profiling: {
    code: string;
    value: string | { gt: string; lt: string };
    desc: string;
  }[];
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

// 11번가/웹앱 계층적 카테고리 선택 컴포넌트
function HierarchicalCategorySection({
  title,
  description,
  icon: Icon,
  metaType,
  selectedCategories,
  onCategoriesChange,
  testIdPrefix,
}: {
  title: string;
  description: string;
  icon: typeof ShoppingBag;
  metaType: '11st' | 'webapp';
  selectedCategories: SelectedCategory[];
  onCategoriesChange: (categories: SelectedCategory[]) => void;
  testIdPrefix: string;
}) {
  const [isOpen, setIsOpen] = useState(selectedCategories.length > 0);
  const [selectedCat1, setSelectedCat1] = useState<string | null>(null);
  const [selectedCat2, setSelectedCat2] = useState<string | null>(null);

  // 카테고리 1 조회
  const { data: cat1Data, isLoading: cat1Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`],
  });

  // 카테고리 2 조회 (cat1 선택 시)
  const { data: cat2Data, isLoading: cat2Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`, selectedCat1],
    queryFn: async () => {
      if (!selectedCat1) return { metaType: '', dataType: '', list: [] };
      const res = await fetch(`/api/ats/meta/${metaType}?cateid=${selectedCat1}`);
      return res.json();
    },
    enabled: !!selectedCat1,
  });

  // 카테고리 3 조회 (cat2 선택 시)
  const { data: cat3Data, isLoading: cat3Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`, selectedCat1, selectedCat2],
    queryFn: async () => {
      if (!selectedCat2) return { metaType: '', dataType: '', list: [] };
      const res = await fetch(`/api/ats/meta/${metaType}?cateid=${selectedCat2}`);
      return res.json();
    },
    enabled: !!selectedCat2,
  });

  const cat1List = cat1Data?.list || [];
  const cat2List = cat2Data?.list || [];
  const cat3List = cat3Data?.list || [];

  // cateid로 표시명 조회 (BizChat API는 cateid 코드를 기대함)
  const getCat1Name = (cateid: string) => cat1List.find(c => c.cateid === cateid)?.name || cateid;
  const getCat2Name = (cateid: string) => cat2List.find(c => c.cateid === cateid)?.name || cateid;
  const getCat3Name = (cateid: string) => cat3List.find(c => c.cateid === cateid)?.name || cateid;

  const addCategory = (cat1Cateid: string, cat2Cateid?: string, cat3Cateid?: string) => {
    // cateid 코드와 표시명을 모두 저장 (BizChat API는 cateid 코드를 기대)
    const newCat: SelectedCategory = { 
      cat1: cat1Cateid,  // cateid 코드 저장 (예: "01")
      cat1Name: getCat1Name(cat1Cateid),  // 표시명 저장 (예: "가구/인테리어")
    };
    if (cat2Cateid) {
      newCat.cat2 = cat2Cateid;  // cateid 코드 (예: "0101")
      newCat.cat2Name = getCat2Name(cat2Cateid);
    }
    if (cat3Cateid) {
      newCat.cat3 = cat3Cateid;  // cateid 코드 (예: "010101")
      newCat.cat3Name = getCat3Name(cat3Cateid);
    }

    // 중복 체크 (cateid 코드로 비교)
    const isDuplicate = selectedCategories.some(
      c => c.cat1 === newCat.cat1 && c.cat2 === newCat.cat2 && c.cat3 === newCat.cat3
    );
    if (!isDuplicate) {
      onCategoriesChange([...selectedCategories, newCat]);
    }
  };

  const removeCategory = (index: number) => {
    onCategoriesChange(selectedCategories.filter((_, i) => i !== index));
  };

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
          <CardContent className="pt-0 space-y-4">
            {/* 선택된 카테고리 표시 */}
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((cat, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`${testIdPrefix}-selected-${index}`}
                  >
                    {cat.cat1Name || cat.cat1}
                    {cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}
                    {cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeCategory(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* 계층적 선택 UI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 카테고리 1 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">대분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {cat1Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat1List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className={cn(
                            "flex items-center justify-between p-2 rounded cursor-pointer text-small",
                            selectedCat1 === cat.cateid
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setSelectedCat1(cat.cateid);
                            setSelectedCat2(null);
                          }}
                          data-testid={`${testIdPrefix}-cat1-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* 카테고리 2 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">중분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {!selectedCat1 ? (
                    <div className="text-center py-4 text-small text-muted-foreground">
                      대분류를 선택하세요
                    </div>
                  ) : cat2Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : cat2List.length === 0 ? (
                    <div className="text-center py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addCategory(selectedCat1)}
                        data-testid={`${testIdPrefix}-add-cat1`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        대분류만 추가
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat2List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className={cn(
                            "flex items-center justify-between p-2 rounded cursor-pointer text-small",
                            selectedCat2 === cat.cateid
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          )}
                          onClick={() => setSelectedCat2(cat.cateid)}
                          data-testid={`${testIdPrefix}-cat2-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* 카테고리 3 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">소분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {!selectedCat2 ? (
                    <div className="text-center py-4 text-small text-muted-foreground">
                      중분류를 선택하세요
                    </div>
                  ) : cat3Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : cat3List.length === 0 ? (
                    <div className="text-center py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addCategory(selectedCat1!, selectedCat2)}
                        data-testid={`${testIdPrefix}-add-cat2`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        중분류까지 추가
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat3List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className="flex items-center justify-between p-2 rounded cursor-pointer text-small hover:bg-muted"
                          onClick={() => addCategory(selectedCat1!, selectedCat2!, cat.cateid)}
                          data-testid={`${testIdPrefix}-cat3-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <Plus className="h-4 w-4 text-primary" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// 위치 검색 컴포넌트
function LocationSearchSection({
  selectedLocations,
  onLocationsChange,
}: {
  selectedLocations: AdvancedTargetingState['locations'];
  onLocationsChange: (locations: AdvancedTargetingState['locations']) => void;
}) {
  const [isOpen, setIsOpen] = useState(selectedLocations.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BizChatLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locationType, setLocationType] = useState<'home' | 'work'>('home');

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await apiRequest('POST', '/api/ats/meta/loc', { addr: searchQuery });
      const data: BizChatLocationResponse = await res.json();
      setSearchResults(data.list || []);
    } catch (error) {
      console.error('Location search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const addLocation = (loc: BizChatLocation) => {
    const newLoc = {
      code: loc.hcode,
      type: locationType,
      name: `${loc.ado} ${loc.sigu} ${loc.dong}`.trim(),
    };
    
    // 중복 체크
    const isDuplicate = selectedLocations.some(
      l => l.code === newLoc.code && l.type === newLoc.type
    );
    if (!isDuplicate) {
      onLocationsChange([...selectedLocations, newLoc]);
    }
  };

  const removeLocation = (index: number) => {
    onLocationsChange(selectedLocations.filter((_, i) => i !== index));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedLocations.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">위치 타겟팅</CardTitle>
                  <CardDescription className="text-small">
                    추정 집주소/직장주소로 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLocations.length > 0 && (
                  <Badge variant="secondary">{selectedLocations.length}개 지역</Badge>
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
            {/* 선택된 위치 표시 */}
            {selectedLocations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedLocations.map((loc, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`location-selected-${index}`}
                  >
                    [{loc.type === 'home' ? '집' : '직장'}] {loc.name}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeLocation(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* 위치 유형 선택 */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={locationType === 'home' ? 'default' : 'outline'}
                onClick={() => setLocationType('home')}
                data-testid="button-location-type-home"
              >
                추정 집주소
              </Button>
              <Button
                size="sm"
                variant={locationType === 'work' ? 'default' : 'outline'}
                onClick={() => setLocationType('work')}
                data-testid="button-location-type-work"
              >
                추정 직장주소
              </Button>
            </div>

            {/* 검색 */}
            <div className="flex gap-2">
              <Input
                placeholder="지역명 검색 (예: 강남, 양양)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                data-testid="input-location-search"
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="space-y-1">
                  {searchResults.map((loc, index) => (
                    <div
                      key={`${loc.hcode}-${index}`}
                      className="flex items-center justify-between p-2 rounded cursor-pointer text-small hover:bg-muted"
                      onClick={() => addLocation(loc)}
                      data-testid={`location-result-${loc.hcode}`}
                    >
                      <span>{loc.ado} {loc.sigu} {loc.dong}</span>
                      <Plus className="h-4 w-4 text-primary" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// 프로파일링 필터 컴포넌트
function ProfilingSection({
  selectedProfiling,
  onProfilingChange,
}: {
  selectedProfiling: AdvancedTargetingState['profiling'];
  onProfilingChange: (profiling: AdvancedTargetingState['profiling']) => void;
}) {
  const [isOpen, setIsOpen] = useState(selectedProfiling.length > 0);

  // 프로파일링 필터 메타 조회
  const { data: proFilterData, isLoading } = useQuery<BizChatFilterResponse>({
    queryKey: ['/api/ats/meta/filter', 'pro'],
    queryFn: async () => {
      const res = await fetch('/api/ats/meta/filter?filterType=pro');
      return res.json();
    },
  });

  const proFilters = proFilterData?.list || [];

  const toggleFilter = (filter: BizChatFilterMeta) => {
    const existingIndex = selectedProfiling.findIndex(p => p.code === filter.code);
    
    if (existingIndex >= 0) {
      // 제거
      onProfilingChange(selectedProfiling.filter((_, i) => i !== existingIndex));
    } else {
      // 추가
      let value: string | { gt: string; lt: string };
      if (filter.dataType === 'boolean') {
        value = 'Y';
      } else if (filter.dataType === 'number') {
        value = { gt: String(filter.min), lt: String(filter.max) };
      } else {
        value = filter.attributes[0]?.val || 'Y';
      }
      
      onProfilingChange([
        ...selectedProfiling,
        {
          code: filter.code,
          value,
          desc: filter.name + (filter.desc ? ` (${filter.desc})` : ''),
        },
      ]);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedProfiling.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">프로파일링 (예측 모델)</CardTitle>
                  <CardDescription className="text-small">
                    행동 예측 기반 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedProfiling.length > 0 && (
                  <Badge variant="secondary">{selectedProfiling.length}개 선택</Badge>
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
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : proFilters.length === 0 ? (
              <div className="text-center py-6 text-small text-muted-foreground">
                프로파일링 필터를 사용할 수 없습니다
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {proFilters.map((filter) => {
                  const isSelected = selectedProfiling.some(p => p.code === filter.code);
                  return (
                    <Label
                      key={filter.code}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      data-testid={`profiling-${filter.code}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleFilter(filter)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-small">{filter.name}</div>
                        {filter.desc && (
                          <div className="text-tiny text-muted-foreground">{filter.desc}</div>
                        )}
                      </div>
                    </Label>
                  );
                })}
              </div>
            )}
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

  useEffect(() => {
    const estimateAudience = async () => {
      setIsEstimating(true);
      try {
        const res = await apiRequest("POST", "/api/targeting/estimate", {
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

  // 안전하게 배열 길이 확인 (undefined 방지)
  const hasAdvancedFilters =
    (targeting?.shopping11stCategories?.length ?? 0) > 0 ||
    (targeting?.webappCategories?.length ?? 0) > 0 ||
    (targeting?.locations?.length ?? 0) > 0 ||
    (targeting?.profiling?.length ?? 0) > 0;

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
              {(targeting?.shopping11stCategories ?? []).map((cat, i) => (
                <Badge key={`11st-${i}`} variant="secondary" className="text-tiny">
                  11번가: {cat.cat1Name || cat.cat1}{cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}{cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                </Badge>
              ))}
              {(targeting?.webappCategories ?? []).map((cat, i) => (
                <Badge key={`webapp-${i}`} variant="secondary" className="text-tiny">
                  앱: {cat.cat1Name || cat.cat1}{cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}{cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                </Badge>
              ))}
              {(targeting?.locations ?? []).map((loc, i) => (
                <Badge key={`loc-${i}`} variant="secondary" className="text-tiny">
                  {loc.type === 'home' ? '집' : '직장'}: {loc.name}
                </Badge>
              ))}
              {(targeting?.profiling ?? []).map((pro, i) => (
                <Badge key={`pro-${i}`} variant="secondary" className="text-tiny">
                  {pro.desc}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <HierarchicalCategorySection
          title="11번가 쇼핑 관심사"
          description="11번가 쇼핑 카테고리 기반 타겟팅"
          icon={ShoppingBag}
          metaType="11st"
          selectedCategories={targeting?.shopping11stCategories ?? []}
          onCategoriesChange={(cats) => 
            onTargetingChange({ ...targeting, shopping11stCategories: cats })
          }
          testIdPrefix="11st"
        />

        <HierarchicalCategorySection
          title="웹/앱 사용 관심사"
          description="자주 사용하는 앱/웹 카테고리 기반 타겟팅"
          icon={Smartphone}
          metaType="webapp"
          selectedCategories={targeting?.webappCategories ?? []}
          onCategoriesChange={(cats) => 
            onTargetingChange({ ...targeting, webappCategories: cats })
          }
          testIdPrefix="webapp"
        />

        <LocationSearchSection
          selectedLocations={targeting?.locations ?? []}
          onLocationsChange={(locs) =>
            onTargetingChange({ ...targeting, locations: locs })
          }
        />

        <ProfilingSection
          selectedProfiling={targeting?.profiling ?? []}
          onProfilingChange={(pro) =>
            onTargetingChange({ ...targeting, profiling: pro })
          }
        />
      </div>
    </div>
  );
}

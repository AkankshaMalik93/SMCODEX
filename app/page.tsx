"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KpiDefinition,
  NetworkData,
  ProjectionPoint,
  ScenarioDefinition,
  ScenarioId,
  SimulationConfigResponse,
  SimulationRunResponse,
  SupplierRisk,
  UserInputDefinition,
} from "@/app/lib/shared/simulation-types";

type MultiSelectProps = {
  title: string;
  items: string[];
  selected: string[];
  allowSearch: boolean;
  onChange: (next: string[]) => void;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

const formatValue = (value: number, format: KpiDefinition["format"]) => {
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (format === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
};

const KPI_DIRECTION: Record<string, "higher_better" | "lower_better"> = {
  totalCost: "lower_better",
  revenue: "higher_better",
  netProfit: "higher_better",
  margin: "higher_better",
  serviceLevel: "higher_better",
};

function MultiSelectFilter({
  title,
  items,
  selected,
  allowSearch,
  onChange,
}: MultiSelectProps) {
  const [search, setSearch] = useState("");
  const [operator, setOperator] = useState<"contains" | "not_contains" | "equals" | "not_equals">("contains");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized || !allowSearch) return items;

    if (operator === "contains") {
      return items.filter((item) => item.toLowerCase().includes(normalized));
    }
    if (operator === "not_contains") {
      return items.filter((item) => !item.toLowerCase().includes(normalized));
    }
    if (operator === "equals") {
      return items.filter((item) => item.toLowerCase() === normalized);
    }
    return items.filter((item) => item.toLowerCase() !== normalized);
  }, [items, search, allowSearch, operator]);

  const toggleItem = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item));
      return;
    }
    onChange([...selected, item]);
  };

  const selectAll = () => onChange(Array.from(new Set([...selected, ...items])));
  const deselectAll = () => onChange([]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <p className="filter-title">{title}</p>
      <button type="button" className="filter-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span>{selected.length > 0 ? `${selected.length} selected` : "Select values"}</span>
        <span className="filter-trigger-icons">
          <span className="filter-funnel" aria-hidden="true">f</span>
          <span>{open ? "v" : ">"}</span>
        </span>
      </button>

      {open && (
        <div className="filter-popover">
          <div className="filter-actions">
            <button type="button" onClick={selectAll}>Select all</button>
            <button type="button" onClick={deselectAll}>Deselect all</button>
            <select
              value={operator}
              onChange={(event) =>
                setOperator(
                  event.target.value as "contains" | "not_contains" | "equals" | "not_equals",
                )
              }
            >
              <option value="contains">Contains</option>
              <option value="not_contains">Not Contains</option>
              <option value="equals">Equals</option>
              <option value="not_equals">Not Equals</option>
            </select>
          </div>

          {allowSearch && (
            <input
              className="filter-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
            />
          )}

          <div className="filter-list">
            {visibleItems.map((item) => (
              <label className="filter-item" key={item}>
                <input
                  type="checkbox"
                  checked={selected.includes(item)}
                  onChange={() => toggleItem(item)}
                />
                {item}
              </label>
            ))}
            {visibleItems.length === 0 && <p className="filter-empty">No matching results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function buildLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function ProjectionChart({ projection }: { projection: ProjectionPoint[] }) {
  const width = 980;
  const height = 280;
  const margin = 36;
  const leftPlotOffset = 26;
  const [showDemand, setShowDemand] = useState(true);
  const [showSupply, setShowSupply] = useState(true);

  const maxVal = Math.max(...projection.flatMap((point) => [point.demand, point.supply]), 1);
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, idx) => {
    const value = Math.round((maxVal * (yTickCount - 1 - idx)) / (yTickCount - 1));
    return value;
  });

  const plotStartX = margin + leftPlotOffset;
  const plotEndX = width - margin;
  const scaleX = (idx: number) =>
    plotStartX + (idx * (plotEndX - plotStartX)) / Math.max(projection.length - 1, 1);
  const scaleY = (value: number) => height - margin - (value / maxVal) * (height - margin * 2);

  const demandPoints = projection.map((point, idx) => ({ x: scaleX(idx), y: scaleY(point.demand) }));
  const supplyPoints = projection.map((point, idx) => ({ x: scaleX(idx), y: scaleY(point.supply) }));

  const firstFutureIndex = projection.findIndex((point) => point.future);
  const splitIndex = firstFutureIndex === -1 ? projection.length : firstFutureIndex;

  const pastDemand = demandPoints.slice(0, Math.max(splitIndex, 1));
  const futureDemand = demandPoints.slice(Math.max(splitIndex - 1, 0));
  const pastSupply = supplyPoints.slice(0, Math.max(splitIndex, 1));
  const futureSupply = supplyPoints.slice(Math.max(splitIndex - 1, 0));

  return (
    <>
      <div className="line-toggle-row">
        <button
          type="button"
          className={showDemand ? "line-toggle active" : "line-toggle"}
          onClick={() => setShowDemand((prev) => !prev)}
        >
          Demand
        </button>
        <button
          type="button"
          className={showSupply ? "line-toggle active" : "line-toggle"}
          onClick={() => setShowSupply((prev) => !prev)}
        >
          Supply
        </button>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projection chart">
        <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} className="axis" />
        <line x1={margin} y1={margin} x2={margin} y2={height - margin} className="axis" />
        <text x={margin - 4} y={height - margin + 14} className="origin-label">
          0
        </text>

        {yTicks.map((tick) => {
          const y = scaleY(tick);
          return (
            <g key={tick}>
              <line
                x1={margin}
                y1={y}
                x2={width - margin}
                y2={y}
                className="grid-line"
              />
              <text x={margin - 8} y={y + 4} className="y-label">
                {tick}
              </text>
            </g>
          );
        })}

        {showDemand && <path d={buildLinePath(pastDemand)} className="line demand-solid" />}
        {showDemand && <path d={buildLinePath(futureDemand)} className="line demand-dotted" />}
        {showSupply && <path d={buildLinePath(pastSupply)} className="line supply-solid" />}
        {showSupply && <path d={buildLinePath(futureSupply)} className="line supply-dotted" />}

        {projection.map((point, idx) => {
          const gap = point.supply - point.demand;
          const pointClass = gap < 0 ? "point-shortage" : gap > 0 ? "point-inventory" : "point-balanced";
          return (
            <g key={`markers-${point.label}-${idx}`}>
              {showDemand && (
                <circle cx={scaleX(idx)} cy={scaleY(point.demand)} r={3.5} className={pointClass}>
                  <title>{`${point.label}: Demand=${point.demand}, Supply=${point.supply}, Gap=${gap}`}</title>
                </circle>
              )}
              {showSupply && (
                <circle cx={scaleX(idx)} cy={scaleY(point.supply)} r={3.5} className={pointClass}>
                  <title>{`${point.label}: Demand=${point.demand}, Supply=${point.supply}, Gap=${gap}`}</title>
                </circle>
              )}
            </g>
          );
        })}

        {projection.map((point, idx) => (
          <text key={point.label + idx} x={scaleX(idx)} y={height - 10} className="label">
            {point.label}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span><i className="legend-swatch demand-solid" />Demand actual</span>
        <span><i className="legend-swatch demand-dotted" />Demand forecast</span>
        <span><i className="legend-swatch supply-solid" />Supply actual</span>
        <span><i className="legend-swatch supply-dotted" />Supply projected</span>
      </div>
    </>
  );
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = {
    x: cx + radius * Math.cos((Math.PI / 180) * startAngle),
    y: cy + radius * Math.sin((Math.PI / 180) * startAngle),
  };
  const end = {
    x: cx + radius * Math.cos((Math.PI / 180) * endAngle),
    y: cy + radius * Math.sin((Math.PI / 180) * endAngle),
  };

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function SupplierRiskDonut({ risks }: { risks: SupplierRisk[] }) {
  const topThree = risks.slice(0, 3);
  const palette = ["#22c55e", "#f4b400", "#ef4444"];
  const total = Math.max(topThree.reduce((acc, row) => acc + row.risk, 0), 1);

  const segments: DonutSegment[] = topThree.map((row, idx) => ({
    label: `S${idx + 1}`,
    value: row.risk,
    color: palette[idx],
  }));

  const arcs = segments.reduce<{ start: number; sweep: number; segment: DonutSegment }[]>(
    (acc, segment, idx) => {
      const previousEnd = idx === 0 ? -90 : acc[idx - 1].start + acc[idx - 1].sweep;
      const sweep = (segment.value / total) * 360;
      return [...acc, { start: previousEnd, sweep, segment }];
    },
    [],
  );

  return (
    <div className="risk-wrap">
      <svg viewBox="0 0 220 220" className="donut-chart" role="img" aria-label="Supplier risk chart">
        <circle cx="110" cy="110" r="70" className="donut-base" />
        {arcs.map((arc) => {
          const path = describeArc(110, 110, 70, arc.start, arc.start + arc.sweep);
          return (
            <path
              key={arc.segment.label}
              d={path}
              stroke={arc.segment.color}
              strokeWidth="32"
              fill="none"
            />
          );
        })}
        <circle cx="110" cy="110" r="44" className="donut-hole" />
      </svg>

      <div className="donut-legend">
        {segments.map((segment) => (
          <div className="donut-legend-row" key={segment.label}>
            <span className="donut-dot" style={{ backgroundColor: segment.color }} />
            <span>{segment.label}</span>
            <strong>{segment.value.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DummyNetworkDiagram({
  network,
  isExpanded,
  onToggle,
}: {
  network: NetworkData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const nodes = [
    { id: "sup1", label: "Supplier 1", type: "supplier", city: "Oulu", x: 130, y: 110 },
    { id: "sup2", label: "Supplier 2", type: "supplier", city: "Kuopio", x: 130, y: 190 },
    { id: "vendor1", label: "External Vendor", type: "vendor", city: "Rovaniemi", x: 210, y: 150 },
    { id: "plant1", label: "Plant", type: "plant", city: "Tampere", x: 350, y: 150 },
    { id: "rdc1", label: "RDC 1", type: "rdc", city: "Turku", x: 500, y: 118 },
    { id: "rdc2", label: "RDC 2", type: "rdc", city: "Lahti", x: 500, y: 202 },
    { id: "dc1", label: "DC 1", type: "dc", city: "Helsinki", x: 650, y: 118 },
    { id: "dc2", label: "DC 2", type: "dc", city: "Vantaa", x: 650, y: 202 },
    { id: "ret1", label: "Retailer 1", type: "retailer", city: "Espoo", x: 840, y: 92 },
    { id: "ret2", label: "Retailer 2", type: "retailer", city: "Porvoo", x: 840, y: 146 },
    { id: "ret3", label: "Retailer 3", type: "retailer", city: "Pori", x: 840, y: 202 },
    { id: "ret4", label: "Retailer 4", type: "retailer", city: "Lappeenranta", x: 840, y: 258 },
  ] as const;

  const links = [
    ["sup1", "plant1"],
    ["sup2", "plant1"],
    ["vendor1", "plant1"],
    ["plant1", "rdc1"],
    ["plant1", "rdc2"],
    ["rdc1", "dc1"],
    ["rdc1", "dc2"],
    ["rdc2", "dc1"],
    ["rdc2", "dc2"],
    ["dc1", "ret1"],
    ["dc2", "ret1"],
    ["dc1", "ret2"],
    ["dc2", "ret2"],
    ["dc1", "ret3"],
    ["dc2", "ret4"],
  ] as const;

  const getNodeById = (id: string) => nodes.find((node) => node.id === id);
  const linkPath = (fromId: string, toId: string) => {
    const from = getNodeById(fromId);
    const to = getNodeById(toId);
    if (!from || !to) return "";
    const bend = Math.max(14, Math.abs(to.x - from.x) * 0.16);
    const verticalBias = (to.y - from.y) * 0.18;
    return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y + verticalBias}, ${to.x - bend} ${to.y - verticalBias}, ${to.x} ${to.y}`;
  };

  return (
    <div className="network-card">
      <div className="viz-head">
        <h3>Global Network Map</h3>
        <button type="button" className="expand-btn" onClick={onToggle}>
          {isExpanded ? "Collapse" : "Expand"}
        </button>
        <div className="network-stats">
          <span>Suppliers: 2</span>
          <span>External Vendor: 1</span>
          <span>Plant: 1</span>
          <span>RDC: 2</span>
          <span>DC: 2</span>
          <span>Retailers: 4</span>
        </div>
      </div>
      <div className="network-legend">
        <span><i className="legend-dot supplier" />Suppliers</span>
        <span><i className="legend-dot vendor" />External Vendors</span>
        <span><i className="legend-dot factory" />Plant</span>
        <span><i className="legend-dot warehouse" />RDC</span>
        <span><i className="legend-dot dc" />DC</span>
        <span><i className="legend-dot retailer" />Retailers</span>
      </div>

      <svg viewBox="0 0 980 360" className="network-svg" role="img" aria-label="Global network flow map">
        <defs>
          <marker
            id="networkArrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L6,3 z" className="network-arrow-head" />
          </marker>
        </defs>

        <rect x="16" y="14" width="948" height="332" className="network-boundary" rx="12" />
        <path className="continent" d="M178 120 L204 106 L256 108 L286 128 L288 154 L264 174 L220 180 L184 166 L170 142 Z" />
        <path className="continent" d="M248 188 L280 202 L300 228 L280 260 L248 252 L226 224 Z" />
        <path className="continent" d="M430 112 L466 88 L520 86 L558 96 L578 118 L562 142 L526 152 L500 170 L468 166 L444 144 Z" />
        <path className="continent" d="M528 164 L568 156 L620 168 L668 176 L716 166 L772 178 L784 204 L758 220 L702 224 L672 236 L624 234 L594 220 L568 202 L540 190 Z" />
        <path className="continent" d="M730 244 L764 254 L792 272 L774 294 L742 290 L716 272 Z" />
        <text x="430" y="46" className="finland-title">World Network View</text>

        {links.map(([from, to]) => (
          <path key={`${from}-${to}`} d={linkPath(from, to)} className="network-link" />
        ))}

        {nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <path className={`map-pin ${node.type}`} d="M0 -14 C7 -14 12 -9 12 -2 C12 8 0 18 0 18 C0 18 -12 8 -12 -2 C-12 -9 -7 -14 0 -14 Z" />
            <circle cx="0" cy="-2" r="4" className="map-pin-core" />
            <text
              x={node.type === "retailer" ? 18 : 0}
              y={node.type === "retailer" ? 2 : 30}
              textAnchor={node.type === "retailer" ? "start" : "middle"}
              className="network-label"
            >
              {node.label}
            </text>
            <text
              x={node.type === "retailer" ? 18 : 0}
              y={node.type === "retailer" ? 15 : 42}
              textAnchor={node.type === "retailer" ? "start" : "middle"}
              className="network-sub-label"
            >
              {node.city}
            </text>
          </g>
        ))}
      </svg>
      <p className="network-perm-note">
        Retailer coverage: Retailer 1 & 2 are served by both DCs; Retailer 3 only by DC 1; Retailer 4 only by DC 2.
      </p>
      <p className="network-note">{network.note}</p>
    </div>
  );
}

export default function Home() {
  const [config, setConfig] = useState<SimulationConfigResponse | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [selectedUserInputs, setSelectedUserInputs] = useState<Record<string, number>>({});
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});
  const [activeScenario, setActiveScenario] = useState<ScenarioId>("baseline");
  const [baselineData, setBaselineData] = useState<SimulationRunResponse | null>(null);
  const [scenarioData, setScenarioData] = useState<Partial<Record<ScenarioId, SimulationRunResponse>>>({});
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState<"chart" | "risk" | "network" | null>(null);
  const [loading, setLoading] = useState(false);
  const prevCategoryCountRef = useRef<number | null>(null);
  const prevAvailableProductsCountRef = useRef<number>(0);

  const scenarioConfig = useMemo(
    () => config?.scenarios.find((scenario) => scenario.id === activeScenario),
    [config, activeScenario],
  );

  useEffect(() => {
    async function loadConfig() {
      const response = await fetch("/api/simulation/config");
      const payload = (await response.json()) as SimulationConfigResponse;
      setConfig(payload);
      setSelectedFilters(payload.defaultFilters);
      setSelectedUserInputs(payload.defaultUserInputs);
    }

    loadConfig();
  }, []);

  const requestSignature = JSON.stringify({ selectedFilters, selectedUserInputs });

  async function runScenario(
    scenarioId: ScenarioId,
    filters: Record<string, string[]>,
    userInputs: Record<string, number>,
  ) {
    setLoading(true);

    try {
      const response = await fetch("/api/simulation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, filters, userInputs }),
      });

      const payload = (await response.json()) as SimulationRunResponse;
      setFilterOptions(payload.filterOptions);
      setSelectedFilters(payload.appliedFilters);
      setSelectedUserInputs(payload.appliedUserInputs);

      if (scenarioId === "baseline") {
        setBaselineData(payload);
        return;
      }

      setScenarioData((prev) => ({ ...prev, [scenarioId]: payload }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!config || Object.keys(selectedFilters).length === 0) return;
    runScenario("baseline", selectedFilters, selectedUserInputs);
    setScenarioData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, requestSignature]);

  useEffect(() => {
    if (!config || activeScenario === "baseline") return;
    runScenario(activeScenario, selectedFilters, selectedUserInputs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario, config, requestSignature]);

  useEffect(() => {
    const currentCategoryCount = (selectedFilters.category ?? []).length;
    const currentProductCount = (selectedFilters.product ?? []).length;
    const availableProducts = filterOptions.product ?? [];
    const previousCategoryCount = prevCategoryCountRef.current;
    const previousAvailableProductsCount = prevAvailableProductsCountRef.current;
    const categoryRecovered = previousCategoryCount === 0 && currentCategoryCount > 0;
    const productsBecameAvailable =
      previousAvailableProductsCount === 0 &&
      availableProducts.length > 0 &&
      currentCategoryCount > 0;

    if (
      (categoryRecovered || productsBecameAvailable) &&
      currentProductCount === 0 &&
      availableProducts.length > 0
    ) {
      setSelectedFilters((prev) => ({
        ...prev,
        product: availableProducts,
      }));
    }

    prevCategoryCountRef.current = currentCategoryCount;
    prevAvailableProductsCountRef.current = availableProducts.length;
  }, [selectedFilters.category, selectedFilters.product, filterOptions.product]);

  const activeData =
    activeScenario === "baseline" ? baselineData : scenarioData[activeScenario] ?? baselineData;

  const toggleExpand = (panel: "chart" | "risk" | "network") => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  };

  return (
    <main className="simulation-shell">
      <aside className="left-nav">
        <div className="nav-title">Page Group</div>
        <button
          type="button"
          className="group-toggle"
          onClick={() => setIsGroupOpen((prev) => !prev)}
        >
          <span>Simulation</span>
          <span>{isGroupOpen ? "v" : ">"}</span>
        </button>

        {isGroupOpen && (
          <div className="page-list">
            {(config?.scenarios ?? []).map((scenario: ScenarioDefinition) => (
              <button
                key={scenario.id}
                type="button"
                className={scenario.id === activeScenario ? "page-item active" : "page-item"}
                onClick={() => setActiveScenario(scenario.id)}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="main-workspace">
        <header className="workspace-head">
          <div>
            <p className="title-kicker">Simulation Workspace</p>
            <h1>{scenarioConfig?.label ?? "Loading scenario..."}</h1>
          </div>
          {scenarioConfig?.hasRunButton && (
            <button
              type="button"
              className="run-btn"
              onClick={() => runScenario(activeScenario, selectedFilters, selectedUserInputs)}
            >
              {loading ? "Running..." : "Run Scenario"}
            </button>
          )}
        </header>

        <section className="top-filters">
          {(config?.filters ?? []).map((filter) => (
            <MultiSelectFilter
              key={filter.id}
              title={filter.label}
              items={filterOptions[filter.id] ?? selectedFilters[filter.id] ?? []}
              selected={selectedFilters[filter.id] ?? []}
              allowSearch={filter.allowSearch}
              onChange={(next) =>
                setSelectedFilters((prev) => ({
                  ...prev,
                  [filter.id]: next,
                }))
              }
            />
          ))}
        </section>

        <section className="top-inputs">
          {(config?.userInputs ?? []).map((input: UserInputDefinition) => (
            <div key={input.id} className="input-card">
              <div className="input-head">
                <span>{input.label}</span>
                <strong>
                  {(selectedUserInputs[input.id] ?? 0).toFixed(0)}{input.suffix ?? ""}
                </strong>
              </div>
              <input
                type="range"
                min={input.min}
                max={input.max}
                step={input.step}
                value={selectedUserInputs[input.id] ?? input.min}
                onChange={(event) =>
                  setSelectedUserInputs((prev) => ({
                    ...prev,
                    [input.id]: Number(event.target.value),
                  }))
                }
              />
            </div>
          ))}
        </section>

        <section className="kpi-row">
          {(config?.kpis ?? []).map((kpi: KpiDefinition) => {
            const currentValue = activeData?.kpis[kpi.id] ?? 0;
            const baselineValue = baselineData?.kpis[kpi.id] ?? 0;
            const showDelta = activeScenario !== "baseline" && baselineValue !== 0;
            const delta = showDelta
              ? ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100
              : 0;
            const direction = KPI_DIRECTION[kpi.id] ?? "higher_better";
            const isPositiveBusinessImpact =
              direction === "lower_better" ? delta <= 0 : delta >= 0;

            return (
              <article className="kpi-card" key={kpi.id}>
                <p className="kpi-label">{kpi.label}</p>
                <p className="kpi-value">{formatValue(currentValue, kpi.format)}</p>
                {showDelta && (
                  <p className={isPositiveBusinessImpact ? "kpi-delta up" : "kpi-delta down"}>
                    {delta >= 0 ? "+" : "-"} {Math.abs(delta).toFixed(1)}% vs baseline
                  </p>
                )}
              </article>
            );
          })}
        </section>

        {activeData && (
          <>
            {expandedPanel !== "network" && (
              <section className={expandedPanel ? "viz-grid single" : "viz-grid"}>
              {(!expandedPanel || expandedPanel === "chart") && (
                <div className="viz-card">
                  <div className="viz-head">
                    <h3>Demand vs Supply Projection</h3>
                    <button
                      type="button"
                      className="expand-btn"
                      onClick={() => toggleExpand("chart")}
                    >
                      {expandedPanel === "chart" ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <ProjectionChart projection={activeData.projection} />
                </div>
              )}

              {(!expandedPanel || expandedPanel === "risk") && (
                <div className="viz-card">
                  <div className="viz-head">
                    <h3>Supplier Risk Exposure</h3>
                    <button
                      type="button"
                      className="expand-btn"
                      onClick={() => toggleExpand("risk")}
                    >
                      {expandedPanel === "risk" ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <p className="risk-subtext">Risk scores weighted by volume</p>
                  <SupplierRiskDonut risks={activeData.supplierRisk} />
                </div>
              )}
              </section>
            )}

            {(!expandedPanel || expandedPanel === "network") && (
              <section className={expandedPanel === "network" ? "network-section expanded" : "network-section"}>
                <DummyNetworkDiagram
                  network={activeData.network}
                  isExpanded={expandedPanel === "network"}
                  onToggle={() => toggleExpand("network")}
                />
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

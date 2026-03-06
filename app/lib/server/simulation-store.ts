import {
  FilterDefinition,
  KpiDefinition,
  ProjectionPoint,
  ScenarioDefinition,
  ScenarioId,
  SimulationConfigResponse,
  SimulationRunResponse,
  SupplierRisk,
  UserInputDefinition,
} from "../shared/simulation-types";

type ProductRecord = {
  name: string;
  category: string;
};

const PRODUCTS: ProductRecord[] = [
  { category: "Beverages", name: "Energy Drink 250ml" },
  { category: "Beverages", name: "Sparkling Water 500ml" },
  { category: "Beverages", name: "Juice Pack 1L" },
  { category: "Snacks", name: "Protein Bar" },
  { category: "Snacks", name: "Salted Chips" },
  { category: "Snacks", name: "Trail Mix" },
  { category: "Frozen", name: "Frozen Pizza" },
  { category: "Frozen", name: "Frozen Veg Mix" },
  { category: "Personal Care", name: "Daily Shampoo" },
  { category: "Personal Care", name: "Hand Wash Gel" },
  { category: "Personal Care", name: "Body Lotion" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FILTERS: FilterDefinition[] = [
  {
    id: "category",
    label: "Product Categories",
    allowSearch: true,
    allowSelectAll: true,
  },
  {
    id: "product",
    label: "Products (Finished Goods)",
    allowSearch: true,
    allowSelectAll: true,
    dependsOn: "category",
  },
  {
    id: "year",
    label: "Year",
    allowSearch: false,
    allowSelectAll: true,
  },
  {
    id: "month",
    label: "Month",
    allowSearch: true,
    allowSelectAll: true,
  },
];

const KPIS: KpiDefinition[] = [
  { id: "totalCost", label: "Total Cost", format: "currency" },
  { id: "revenue", label: "Revenue", format: "currency" },
  { id: "netProfit", label: "Net Profit", format: "currency" },
  { id: "margin", label: "Margin", format: "percent" },
  { id: "serviceLevel", label: "Service Level", format: "percent" },
];

const USER_INPUTS: UserInputDefinition[] = [
  { id: "demandVolatility", label: "Demand Volatility", min: 0, max: 30, step: 1, suffix: "%" },
  { id: "supplyDisruption", label: "Supply Disruption", min: 0, max: 30, step: 1, suffix: "%" },
];

const DEFAULT_USER_INPUTS: Record<string, number> = {
  demandVolatility: 5,
  supplyDisruption: 0,
};

const SCENARIOS: ScenarioDefinition[] = [
  { id: "baseline", label: "1. Baseline (Fixed Network)", hasRunButton: false },
  { id: "minCost", label: "2. Min Cost Scenario", hasRunButton: true },
  { id: "maximizeProfit", label: "3. Maximize Profit", hasRunButton: true },
  { id: "minLeadTime", label: "4. Min Lead Time", hasRunButton: true },
  { id: "maxReliability", label: "5. Max Reliability Supplier", hasRunButton: true },
];

const SCENARIO_FACTORS: Record<
  ScenarioId,
  { cost: number; revenue: number; service: number; risk: number; networkShift: number; supply: number }
> = {
  baseline: { cost: 1, revenue: 1, service: 1, risk: 1, networkShift: 0, supply: 1 },
  minCost: { cost: 0.86, revenue: 0.96, service: 0.95, risk: 1.14, networkShift: -1, supply: 0.95 },
  maximizeProfit: { cost: 0.97, revenue: 1.16, service: 0.97, risk: 1.06, networkShift: 1, supply: 1.03 },
  minLeadTime: { cost: 1.06, revenue: 1.04, service: 1.08, risk: 0.9, networkShift: 1, supply: 1.1 },
  maxReliability: { cost: 1.09, revenue: 1.01, service: 1.11, risk: 0.72, networkShift: 2, supply: 1.07 },
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const unique = (items: string[]) => Array.from(new Set(items));

const getYears = () => {
  const now = new Date();
  return [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2].map(String);
};

export function getSimulationConfig(): SimulationConfigResponse {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthIndex = now.getMonth();

  const categories = unique(PRODUCTS.map((item) => item.category));
  const months = MONTHS.slice(currentMonthIndex);
  const products = unique(PRODUCTS.map((item) => item.name));

  return {
    filters: FILTERS,
    kpis: KPIS,
    scenarios: SCENARIOS,
    userInputs: USER_INPUTS,
    defaultFilters: {
      category: categories,
      product: products,
      year: [currentYear],
      month: months,
    },
    defaultUserInputs: DEFAULT_USER_INPUTS,
  };
}

export function getFilterOptions(selectedFilters: Record<string, string[]>) {
  const selectedCategories = selectedFilters.category ?? [];
  const categories = unique(PRODUCTS.map((item) => item.category));
  const products =
    selectedCategories.length === 0
      ? []
      : unique(
          PRODUCTS.filter((item) => selectedCategories.includes(item.category)).map(
            (item) => item.name,
          ),
        );

  return {
    category: categories,
    product: products,
    year: getYears(),
    month: MONTHS,
  };
}

export function sanitizeFilters(selectedFilters: Record<string, string[]>) {
  const options = getFilterOptions(selectedFilters);
  const next: Record<string, string[]> = {};

  for (const filter of FILTERS) {
    const currentValues = selectedFilters[filter.id] ?? [];
    const validValues = currentValues.filter((value) => options[filter.id].includes(value));
    next[filter.id] = validValues;
  }

  return { options, filters: next };
}

function buildProjection(
  scenario: ScenarioId,
  demandSeed: number,
  supplySeed: number,
  filters: Record<string, string[]>,
): ProjectionPoint[] {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const points: ProjectionPoint[] = [];
  const factor = SCENARIO_FACTORS[scenario];
  const selectedYears = (filters.year ?? [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  const selectedMonths = filters.month ?? [];
  const selectedMonthIndexes = MONTHS.map((name, idx) =>
    selectedMonths.includes(name) ? idx : -1,
  ).filter((idx) => idx >= 0);

  const periods: { year: number; monthIndex: number }[] = [];
  for (const year of selectedYears) {
    for (const monthIndex of selectedMonthIndexes) {
      periods.push({ year, monthIndex });
    }
  }

  periods.sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  const timeline = periods.length > 0 ? periods : [{ year: now.getFullYear(), monthIndex: now.getMonth() }];

  for (let idx = 0; idx < timeline.length; idx += 1) {
    const { monthIndex, year } = timeline[idx];
    const seasonal = 1 + Math.sin((monthIndex / 12) * Math.PI * 2) * 0.07;
    const trendFactor = 1 + idx * 0.012;
    const periodDate = new Date(year, monthIndex, 1);
    const future = periodDate > currentMonthStart;
    const demand = Math.round(demandSeed * seasonal * trendFactor);
    const supply = Math.round(supplySeed * seasonal * factor.supply * (1 + idx * 0.01));

    points.push({
      label: `${MONTHS[monthIndex]}-${String(year).slice(-2)}`,
      demand,
      supply,
      future,
    });
  }

  return points;
}

function buildSupplierRisk(scenario: ScenarioId, productCount: number): SupplierRisk[] {
  const factor = SCENARIO_FACTORS[scenario];
  const baseRisks = [26, 34, 41, 29, 37];
  const volatility = Math.min(productCount * 0.3, 6);

  return baseRisks.map((base, idx) => ({
    supplier: `Supplier ${idx + 1}`,
    risk: round2(Math.max(8, Math.min(95, base * factor.risk + volatility))),
  }));
}

export function runSimulation(
  scenario: ScenarioId,
  selectedFilters: Record<string, string[]>,
  selectedUserInputs: Record<string, number> = DEFAULT_USER_INPUTS,
): SimulationRunResponse {
  const { options, filters } = sanitizeFilters(selectedFilters);
  const scenarioFactor = SCENARIO_FACTORS[scenario];
  const demandVolatility = Math.max(0, Math.min(30, selectedUserInputs.demandVolatility ?? 0));
  const supplyDisruption = Math.max(0, Math.min(30, selectedUserInputs.supplyDisruption ?? 0));
  const productCount = (filters.product ?? []).length;
  const categoryCount = (filters.category ?? []).length;
  const monthCount = (filters.month ?? []).length;
  const yearCount = (filters.year ?? []).length;

  const baselineCost =
    450_000 + productCount * 52_000 + categoryCount * 22_000 + monthCount * 9_000 + yearCount * 26_000;
  const baselineRevenue = baselineCost * 1.34 + productCount * 30_000;
  const baselineService = Math.min(98, 86 + categoryCount * 1.6 + monthCount * 0.4);

  const demandPenalty = 1 + demandVolatility / 220;
  const disruptionPenalty = 1 + supplyDisruption / 160;
  const totalCost = round2(baselineCost * scenarioFactor.cost * demandPenalty * disruptionPenalty);
  const revenue = round2(
    baselineRevenue * scenarioFactor.revenue * (1 - demandVolatility / 320) * (1 - supplyDisruption / 500),
  );
  const netProfit = round2(revenue - totalCost);
  const margin = revenue === 0 ? 0 : round2((netProfit / revenue) * 100);
  const serviceLevel = round2(
    Math.max(82, Math.min(99.5, baselineService * scenarioFactor.service - demandVolatility * 0.12 - supplyDisruption * 0.3)),
  );

  const demandSeed = (880 + productCount * 44 + monthCount * 18) * (1 + demandVolatility / 180);
  const supplySeed = demandSeed * (0.98 + categoryCount * 0.012) * (1 - supplyDisruption / 160);

  return {
    scenarioId: scenario,
    filterOptions: options,
    appliedFilters: filters,
    appliedUserInputs: {
      demandVolatility,
      supplyDisruption,
    },
    kpis: {
      totalCost,
      revenue,
      netProfit,
      margin,
      serviceLevel,
    },
    projection: buildProjection(scenario, demandSeed, supplySeed, filters),
    supplierRisk: buildSupplierRisk(scenario, productCount),
    network: {
      suppliers: Math.max(4, 8 + scenarioFactor.networkShift),
      plants: Math.max(2, 4 + (scenario === "minCost" ? -1 : 0)),
      dcs: Math.max(3, 6 + (scenario === "minLeadTime" ? 1 : 0)),
      markets: 14,
      note:
        scenario === "baseline"
          ? "Fixed network reference."
          : scenario === "minCost"
            ? "Consolidated lanes and fewer supplier links to reduce cost."
            : scenario === "maximizeProfit"
              ? "Capacity focused on high-margin corridors."
              : scenario === "minLeadTime"
                ? "Additional local fulfillment nodes to reduce lead time."
                : "Dual sourcing enabled on critical raw materials.",
    },
  };
}

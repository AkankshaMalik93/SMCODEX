export type ScenarioId =
  | "baseline"
  | "minCost"
  | "maximizeProfit"
  | "minLeadTime"
  | "maxReliability";

export type FilterDefinition = {
  id: string;
  label: string;
  allowSearch: boolean;
  allowSelectAll: boolean;
  dependsOn?: string;
};

export type KpiDefinition = {
  id: string;
  label: string;
  format: "currency" | "percent" | "number";
};

export type ScenarioDefinition = {
  id: ScenarioId;
  label: string;
  hasRunButton: boolean;
};

export type UserInputDefinition = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
};

export type ProjectionPoint = {
  label: string;
  demand: number;
  supply: number;
  future: boolean;
};

export type SupplierRisk = {
  supplier: string;
  risk: number;
};

export type NetworkData = {
  suppliers: number;
  plants: number;
  dcs: number;
  markets: number;
  note: string;
};

export type SimulationConfigResponse = {
  filters: FilterDefinition[];
  kpis: KpiDefinition[];
  scenarios: ScenarioDefinition[];
  userInputs: UserInputDefinition[];
  defaultFilters: Record<string, string[]>;
  defaultUserInputs: Record<string, number>;
};

export type SimulationRunResponse = {
  scenarioId: ScenarioId;
  filterOptions: Record<string, string[]>;
  appliedFilters: Record<string, string[]>;
  appliedUserInputs: Record<string, number>;
  kpis: Record<string, number>;
  projection: ProjectionPoint[];
  supplierRisk: SupplierRisk[];
  network: NetworkData;
};

// Manual mapping of the blotter (main_tbl) columns
export const tableName = "main_tbl";
export const idField = "ID";
export type ColumnMeta = { field: string; type?: string };
export const columnsMeta: ColumnMeta[] = [
  { field: "RowType", type: "VARCHAR" },
  { field: "ID", type: "VARCHAR" },
  { field: "CounterpartyID", type: "VARCHAR" },
  { field: "StartDate", type: "TIMESTAMP_NS" },
  { field: "TerminationDate", type: "TIMESTAMP_NS" },
  { field: "FixedRate", type: "DOUBLE" },
  { field: "NPV", type: "DOUBLE" },
  { field: "ParRate", type: "DOUBLE" },
  // { field: "ParSpread", type: "DOUBLE" },
  { field: "Notional", type: "BIGINT" },
  { field: "SwapType", type: "VARCHAR" },
  { field: "PayFixed", type: "BOOLEAN" },
];

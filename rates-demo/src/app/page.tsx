"use client";

import * as React from "react";
import Link from "next/link";
import { DataGrid, GridColDef, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import { columnsMeta as generatedColumns, idField as generatedIdField } from "@/generated/blotterColumns";

type ApiColumn = { field: string; type?: string };
type Row = Record<string, any> & { id: string | number };

export default function HomePage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [rowCount, setRowCount] = React.useState(0);
  const initialColumns: GridColDef<Row>[] = React.useMemo(() => {
    const apiCols: ApiColumn[] = generatedColumns || [];
    const gridCols: GridColDef<Row>[] = (apiCols.length ? apiCols : [{ field: generatedIdField || "ID" }]).map((c) => {
      const base: GridColDef<Row> = {
        field: c.field,
        headerName: c.field,
        flex: 1,
      };
      const t = (c.type || "").toLowerCase();
      if (t.includes("int") || t.includes("decimal") || t.includes("double") || t.includes("float") || t.includes("real")) {
        base.type = "number";
        base.flex = undefined;
        base.width = 140;
      } else if (t.includes("date") || t.includes("timestamp")) {
        base.width = 180;
      } else {
        base.width = 200;
      }
      return base;
    });
    const idName = (generatedIdField || "ID").toLowerCase();
    const idx = gridCols.findIndex((c) => c.field.toLowerCase() === idName);
    if (idx >= 0) {
      gridCols[idx] = {
        ...gridCols[idx],
        headerName: generatedIdField || gridCols[idx].headerName,
        renderCell: (params) => <Link href={`/swap/${params.value}`}>{String(params.value)}</Link>,
        width: 180,
      } as GridColDef<Row>;
    }
    return gridCols;
  }, []);
  const [columns, setColumns] = React.useState<GridColDef<Row>[]>(initialColumns);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = React.useState<GridSortModel>([
    { field: (generatedIdField as string) || "ID", sort: "asc" },
  ]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const sortField = sortModel[0]?.field ?? generatedIdField ?? "id";
    const sortOrder = (sortModel[0]?.sort ?? "asc") as "asc" | "desc";
    const url = `/api/swaps?page=${paginationModel.page}&pageSize=${paginationModel.pageSize}&sortField=${sortField}&sortOrder=${sortOrder}`;
    const res = await fetch(url);
    const data = await res.json();
    setRows(data.rows || []);
    setRowCount(data.total || 0);
    setLoading(false);
  }, [paginationModel.page, paginationModel.pageSize, sortModel]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Ensure sort model points to an existing column
  React.useEffect(() => {
    const currentSortField = sortModel[0]?.field;
    if (!currentSortField || !columns.some((c) => c.field === currentSortField)) {
      setSortModel([{ field: columns[0]?.field ?? (generatedIdField as string) ?? "ID", sort: "asc" }]);
    }
  }, [columns]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">this is a landing page</h1>
      <nav className="space-x-4 underline text-blue-600">
        <Link href="/datafeed">datafeed page</Link>
        <Link href="/swap/1" className="ml-4">
          swap detail page
        </Link>
      </nav>

      <div className="h-[600px] border border-gray-700 rounded-md">
        <DataGrid
          rows={rows}
          rowCount={rowCount}
          columns={columns}
          loading={loading}
          paginationMode="server"
          sortingMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          pageSizeOptions={[10, 20, 50]}
          getRowId={(row) => row.id}
          sx={{ color: '#e5e7eb' }}
        />
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { DataGrid, GridColDef, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";

type Row = { id: number; name: string; maturity: string; pv: number };

export default function HomePage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [rowCount, setRowCount] = React.useState(0);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = React.useState<GridSortModel>([{ field: "id", sort: "asc" }]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const sortField = sortModel[0]?.field ?? "id";
    const sortOrder = (sortModel[0]?.sort ?? "asc") as "asc" | "desc";
    const url = `/api/swaps?page=${paginationModel.page}&pageSize=${paginationModel.pageSize}&sortField=${sortField}&sortOrder=${sortOrder}`;
    const res = await fetch(url);
    const data = await res.json();
    setRows(data.rows);
    setRowCount(data.total);
    setLoading(false);
  }, [paginationModel.page, paginationModel.pageSize, sortModel]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: GridColDef<Row>[] = [
    { field: "id", headerName: "ID", width: 90 },
    { field: "name", headerName: "Name", flex: 1 },
    { field: "maturity", headerName: "Maturity", width: 160 },
    { field: "pv", headerName: "PV", width: 120, type: "number" },
  ];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">this is a landing page</h1>
      <nav className="space-x-4 underline text-blue-600">
        <Link href="/datafeed">datafeed page</Link>
        <Link href="/swap/1" className="ml-4">
          swap detail page
        </Link>
      </nav>

      <div className="h-[600px]">
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
        />
      </div>
    </div>
  );
}


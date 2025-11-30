import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwapModalShell } from "@/components/SwapModalShell";

let pushMock = vi.fn();
let replaceMock = vi.fn();
let backMock = vi.fn();
let searchParamsValue = new URLSearchParams();
let isMobileMock = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
  usePathname: () => "/",
  useSearchParams: () => searchParamsValue,
}));

vi.mock("@/lib/useIsMobileViewport", () => ({
  useIsMobileViewport: () => isMobileMock,
}));

vi.mock("@/components/RiskBarChart", () => ({
  RiskBarChart: ({ exposures }: { exposures: any[] }) => (
    <div data-testid="risk-chart">risk-{exposures.length}</div>
  ),
}));

vi.mock("@/components/TableExportControls", () => ({
  CopyTableButton: ({ getText }: { getText: () => string }) => (
    <button data-testid="copy-table" onClick={() => getText && getText()}>
      Copy
    </button>
  ),
  tableToTsv: (columns: any[], rows: any[]) => JSON.stringify({ columns, rows }),
  getTableDragHandlers: () => ({}),
}));

const baseSwapRow = {
  id: "1",
  Notional: 1_000_000,
  CounterpartyID: "ACME",
  StartDate: "2024-01-15",
  TerminationDate: "2025-01-15",
  FixedRate: 3.25,
  SwapType: "SOFR",
  NPV: 1000,
  ParRate: 3.0,
};

const modalApprox = { NPV: 1200, ParRate: 3.1 };
const riskData = { "1Y": 50, "2Y": -25, r: 5 };
const fixedFlows = [{ Period: "P1", NPV: 10, "Discount Factor": 0.99, Rate: 0.03 }];
const floatFlows = [
  { Period: "P1", NPV: -10, "Discount Factor": 0.995, Rate: 0.031, Cashflow: 5 },
  { Period: "P2", NPV: -12, "Discount Factor": 0.993, Rate: 0.032, Cashflow: 6 },
];
const floatFixings = {
  index: 0,
  columns: ["Fixing", "HedgingNotional"],
  rows: [{ Fixing: 0.031, HedgingNotional: 1_000 }],
  cashflow: { Cashflow: 7 },
};

describe("SwapModalShell", () => {
  beforeEach(() => {
    pushMock.mockClear();
    replaceMock.mockClear();
    backMock.mockClear();
    searchParamsValue = new URLSearchParams();
    isMobileMock = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders pricing summary and counterparty link", async () => {
    const user = userEvent.setup();
    render(
      <SwapModalShell
        swapId="1"
        onClose={() => {}}
        swapRow={baseSwapRow}
        modalApprox={modalApprox}
        riskData={riskData}
        fixedFlows={fixedFlows}
        floatFlows={floatFlows}
        floatFixings={floatFixings}
      />
    );

    expect(screen.getByText("Swap 1")).toBeInTheDocument();
    expect(screen.getAllByText("$ 1,000,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3.25%").length).toBeGreaterThan(0);

    const counterpartyLink = screen.getByText("ACME");
    await user.click(counterpartyLink);
    expect(pushMock).toHaveBeenCalledWith("/?counterparty=ACME", { scroll: false });

    await user.click(screen.getByText("Risk"));
    expect(screen.getByTestId("risk-chart")).toHaveTextContent("risk-2");
    expect(screen.getByText("25.00")).toBeInTheDocument();
  });

  it("shows floating cashflows, toggles fixings, and formats overrides", async () => {
    const onRequestFloatFixings = vi.fn();
    const user = userEvent.setup();
    render(
      <SwapModalShell
        swapId="1"
        onClose={() => {}}
        swapRow={baseSwapRow}
        modalApprox={modalApprox}
        riskData={riskData}
        fixedFlows={fixedFlows}
        floatFlows={floatFlows}
        floatFixings={floatFixings}
        onRequestFloatFixings={onRequestFloatFixings}
      />
    );

    await user.click(screen.getByText("Cashflows"));
    expect(screen.getByText("Floating leg cashflows")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // override cashflow applied
    expect(screen.getAllByText("0.031").length).toBeGreaterThan(0); // fixings row visible

    const firstRow = screen.getByText("P1").closest("tr") as HTMLElement;
    await user.click(firstRow);
    expect(onRequestFloatFixings).toHaveBeenCalledWith(null);
  });

  it("fires action buttons for reval and termsheet", async () => {
    const onFullReval = vi.fn();
    const onRequestTermsheet = vi.fn();
    const user = userEvent.setup();
    render(
      <SwapModalShell
        swapId="1"
        onClose={() => {}}
        swapRow={baseSwapRow}
        modalApprox={modalApprox}
        riskData={riskData}
        fixedFlows={fixedFlows}
        floatFlows={floatFlows}
        floatFixings={floatFixings}
        onFullReval={onFullReval}
        onRequestTermsheet={onRequestTermsheet}
      />
    );

    await user.click(screen.getByText("Full reval"));
    expect(onFullReval).toHaveBeenCalled();

    await user.click(screen.getByText("Open termsheet"));
    expect(onRequestTermsheet).toHaveBeenCalled();
  });
});

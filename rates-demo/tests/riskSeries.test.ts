import { describe, expect, it } from "vitest";
import { buildRiskSeries } from "@/lib/riskSeries";

describe("buildRiskSeries", () => {
  it("filters out excluded keys, sorts by tenor, and computes dvo1", () => {
    const row = {
      r: 1,
      pricingtime: "ignore",
      "6M": 5,
      "1Y": -2,
      "3M": 1.1,
      misc: "0",
    };

    const result = buildRiskSeries(row);
    expect(result.exposures.map((e) => e.term)).toEqual(["3M", "6M", "1Y"]);
    expect(result.exposures.map((e) => e.exposure)).toEqual([1.1, 5, -2]);
    expect(result.dvo1).toBeCloseTo(4.1);
  });
});

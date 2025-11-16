import pandas as pd
from pandas import DataFrame
from typing import Optional
from .datafeed import _source

def _ensure_term_index(frame: DataFrame) -> DataFrame:
    if "Term" in frame.columns:
        return frame.set_index("Term")
    return frame.copy()


def get_data_and_return_it(data: DataFrame) -> DataFrame:
    preview = data.head().to_dict(orient="records")
    print("get_data_and_return_it preview:", preview)
    return data


def get_md_changes(
    data: DataFrame,
    original_curve: Optional[DataFrame] = None,
) -> DataFrame:
    cur = _ensure_term_index(data)["Rate"].astype("float64")
    base_frame = original_curve if original_curve is not None else _source.reset_index()
    base = _ensure_term_index(base_frame)["Rate"].astype("float64")
    aligned = cur.reindex(base.index).fillna(method="ffill").fillna(method="bfill")
    delta_pct = aligned - base
    df = pd.DataFrame({"Change": delta_pct * 100.0}, index=base.index)
    return df


def aproximate_swap_quotes(swaps_df: DataFrame, risk_df: DataFrame, new_data: DataFrame) -> DataFrame:
    global _source
    term_cols = _source.index
    risk_df = risk_df.set_index("ID").reindex(swaps_df["ID"]).dropna(how="all")
    npvs = swaps_df["NPV"].astype("float64").to_numpy()
    risk = risk_df[list(term_cols)].astype("float64").to_numpy()
    base_curve = _source.reset_index()
    md_changes_df = get_md_changes(new_data, base_curve)
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npvs = npvs + (risk @ changes)
    swaps_df["NPV"] = new_npvs
    rates = swaps_df["FixedRate"].astype("float64").to_numpy()
    fixedraterisk = risk_df["R"].astype("float64").to_numpy()
    fixedraterisk[fixedraterisk == 0] = 1e-9
    swaps_df["ParRate"] = rates + (new_npvs / fixedraterisk)
    return swaps_df

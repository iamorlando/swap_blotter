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
    if risk_df is None or risk_df.empty:
        return swaps_df

    risk_df = risk_df.set_index("ID")
    # Ensure all tenor columns exist
    for col in term_cols:
        if col not in risk_df.columns:
            risk_df[col] = 0.0
    # Ensure risk vector rows align to swap ids
    risk_df = risk_df.reindex(swaps_df["ID"]).fillna(0.0)

    npvs = swaps_df["NPV"].astype("float64").to_numpy()
    risk = risk_df[list(term_cols)].astype("float64").to_numpy()
    base_curve = _source.reset_index()
    md_changes_df = get_md_changes(new_data, base_curve)
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npvs = npvs + (risk @ changes)
    swaps_df["NPV"] = new_npvs
    rates = swaps_df["FixedRate"].astype("float64").to_numpy()
    fixedraterisk = risk_df["R"].astype("float64") if "R" in risk_df.columns else pd.Series([1.0] * len(risk_df), index=risk_df.index)
    fixedraterisk = fixedraterisk.to_numpy()
    fixedraterisk[fixedraterisk == 0] = 1e-9
    # swaps_df["ParRate"] = rates + (new_npvs / fixedraterisk)
    return swaps_df

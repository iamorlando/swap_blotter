import pandas as pd
from pandas import DataFrame
from typing import Optional
from .datafeed import _source



def get_md_changes(
    data: DataFrame,
    original_curve: Optional[DataFrame] = None,
) -> DataFrame:
    if 'Term' in data.columns:
        data = data.set_index("Term")[['Rate']]
    else:
        data = data.reset_index().set_index("Term")[['Rate']]
    base_frame = original_curve if original_curve is not None else _source
    if 'Term' in base_frame.columns:
        base_frame = base_frame.set_index("Term")[['Rate']]
    else:
        base_frame = base_frame.reset_index().set_index("Term")[['Rate']]
    delta_pct = data - base_frame
    allowed_terms = base_frame.index.intersection(data.index)
    return delta_pct.loc[allowed_terms].rename(columns={"Rate": "Change"})


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
    npvs = swaps_df["NPV"].to_numpy(dtype="float64")
    risk = risk_df[[f'c_{i}' for i in list(term_cols)]].to_numpy(dtype="float64")
    base_curve = _source.reset_index()
    md_changes_df = get_md_changes(new_data, base_curve)
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npvs = npvs + (risk*100 @ changes)
    swaps_df["NPV"] = new_npvs
    rates = swaps_df["FixedRate"].to_numpy(dtype="float64")
    fixedraterisk = risk_df["R"].to_numpy(dtype="float64")
    swaps_df["ParRate"] = rates + (new_npvs / fixedraterisk)/100

    return swaps_df

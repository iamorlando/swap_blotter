import pandas as pd
from pandas import DataFrame
from typing import Optional




def get_md_changes(
    data: DataFrame,
    original_curve: Optional[DataFrame] = None,
) -> DataFrame:
    if 'Term' in data.columns:
        data = data.set_index("Term")[['Rate']]
    else:
        data = data.reset_index().set_index("Term")[['Rate']]
    base_frame = original_curve
    if 'Term' in base_frame.columns:
        base_frame = base_frame.set_index("Term")[['Rate']]
    else:
        base_frame = base_frame.reset_index().set_index("Term")[['Rate']]
    delta_pct = data - base_frame
    allowed_terms = base_frame.index.intersection(data.index)
    return delta_pct.loc[allowed_terms].rename(columns={"Rate": "Change"})


def aproximate_swap_quotes(swaps_df: DataFrame, risk_df: DataFrame, md_changes_df:DataFrame) -> DataFrame:
    term_cols = md_changes_df.index.tolist()
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
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npvs = npvs + (risk*10_000 @ changes)
    swaps_df["NPV"] = new_npvs
    rates = swaps_df["FixedRate"].to_numpy(dtype="float64")
    fixedraterisk = risk_df["R"].to_numpy(dtype="float64")
    swaps_df["ParRate"] = rates + (new_npvs / fixedraterisk)/100

    return swaps_df

def aproximate_counterparty_npv(npv: float, risk_df: DataFrame, md_changes_df:DataFrame) -> float:
    term_cols = md_changes_df.index.tolist()
    if risk_df is None or risk_df.empty:
        return npv

    for col in term_cols:
        if col not in risk_df.columns:
            risk_df[col] = 0.0
    risk = risk_df[[f'c_{i}' for i in list(term_cols)]].to_numpy(dtype="float64")
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npv = npv + (risk*10_000 @ changes)
    return new_npv


def aproximate_counterparty_cashflows(cf_df: DataFrame, cf_risk_df: DataFrame, md_changes_df:DataFrame) -> DataFrame:
    term_cols = md_changes_df.index.tolist()
    if cf_risk_df is None or cf_risk_df.empty:
        return cf_df

    for col in term_cols:
        if col not in cf_risk_df.columns:
            cf_risk_df[col] = 0.0
    risk = cf_risk_df[[f'c_{i}' for i in list(term_cols)]].to_numpy(dtype="float64")
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npv = npv + (risk*10_000 @ changes)
    return new_npv

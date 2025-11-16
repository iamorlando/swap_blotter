import pandas as pd
from pandas import DataFrame
from .datafeed import _source, get_updated_datafeed

def get_data_and_return_it(data:DataFrame)->DataFrame:
    return data
def get_md_changes(data: DataFrame) -> DataFrame:
    global _source
    cur = data.set_index("Term")["Rate"].astype("float64")
    base = _source["Rate"].astype("float64")
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
    md_changes_df = get_md_changes(new_data)
    changes = md_changes_df.loc[term_cols, "Change"].to_numpy(dtype="float64")
    new_npvs = npvs + (risk @ changes)
    swaps_df["NPV"] = new_npvs
    rates = swaps_df["FixedRate"].astype("float64").to_numpy()
    fixedraterisk = risk_df["R"].astype("float64").to_numpy()
    fixedraterisk[fixedraterisk == 0] = 1e-9
    swaps_df["ParRate"] = rates + (new_npvs / fixedraterisk)
    return swaps_df

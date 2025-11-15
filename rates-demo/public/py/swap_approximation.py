import pandas as pd
from typing import Dict, Sequence
from .datafeed import _source

def get_md_changes(data: pd.DataFrame) -> pd.DataFrame:
    global _source # the original datafeed
    df = (data['Rate']-_source['Rate']).rename(columns={"Rate":"Change"})
    df['Change'] = df['Change']*100 # so 0.05 -> 5. parrateslib expects decimal * 100
    return df

def aproximate_swap_quotes(swaps_df:pd.DataFrame,risk_df:pd.DataFrame,new_data:pd.DataFrame) -> pd.DataFrame:
    global  _source
    term_cols =  _source.index
    npvs = swaps_df['NPV'].to_numpy(dtype="float64")
    risk = risk_df[term_cols].to_numpy(dtype="float64")
    md_changes_df = get_md_changes(new_data)[term_cols]
    changes = md_changes_df.loc[term_cols, 'Change'].to_numpy(dtype="float64")
    new_npvs = npvs+(risk*100 @ changes)
    swaps_df['NPV'] = new_npvs
    rates = swaps_df['FixedRate'].to_numpy(dtype="float64")
    fixedraterisk = risk_df['R'].to_numpy(dtype="float64")
    swaps_df['ParRate'] = rates+(new_npvs/fixedraterisk)/100
    return swaps_df

"use client";

import * as React from "react";
import { CssBaseline, ThemeProvider, createTheme, PaletteMode } from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", { defaultMatches: true, noSsr: true });
  const [mode, setMode] = React.useState<PaletteMode>(prefersDark ? "dark" : "light");

  React.useEffect(() => {
    setMode(prefersDark ? "dark" : "light");
  }, [prefersDark]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          background: mode === "dark" ? { default: "#0b1220", paper: "#0b1220" } : { default: "#f4f6fb", paper: "#ffffff" },
          text: mode === "dark" ? { primary: "#e5e7eb", secondary: "#9ca3af" } : { primary: "#0f172a", secondary: "#475569" },
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

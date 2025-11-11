"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const theme = createTheme({
    palette: {
      mode: "dark",
      background: { default: "#0b1220", paper: "#0b1220" },
      text: { primary: "#e5e7eb", secondary: "#9ca3af" },
    },
  });
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}


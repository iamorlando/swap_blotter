import * as React from "react";

type ThemeBarProps = {
  effectiveTheme: "light" | "dark";
  onToggle: () => void;
};

export function ThemeBar({ effectiveTheme, onToggle }: ThemeBarProps) {
  return (
    <div className="fixed top-0 inset-x-0 z-40 h-7 bg-gray-900/85 border-b border-gray-800 backdrop-blur flex items-center justify-end px-3 text-xs">
      <div
        role="button"
        aria-label="Toggle theme"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        className="relative flex items-center gap-1 w-14 h-6 px-1 rounded-full border border-gray-700 bg-gray-800/90 text-gray-200 cursor-pointer select-none"
      >
        <div className="flex-1 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 01.993.883L11 3v1a1 1 0 01-1.993.117L9 4V3a1 1 0 011-1zm5.657 2.343a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707zM10 6a4 4 0 110 8 4 4 0 010-8zm8 3a1 1 0 01.117 1.993L18 11h-1a1 1 0 01-.117-1.993L17 9h1zM4 10a1 1 0 01.117 1.993L4 12H3a1 1 0 01-.117-1.993L3 10h1zm11.657 5.657a1 1 0 010 1.414l-.707.707a1 1 0 01-1.497-1.32l.083-.094.707-.707a1 1 0 011.414 0zM10 16a1 1 0 01.993.883L11 17v1a1 1 0 01-1.993.117L9 18v-1a1 1 0 011-1zm-6.364-.343a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM4.343 4.343a1 1 0 010 1.414L3.636 6.464a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0z" />
          </svg>

        </div>
        <div className="flex-1 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293a8 8 0 01-10.586-10.586.75.75 0 00-.853-1.201A9.501 9.501 0 1018.5 14.146a.75.75 0 00-1.207-.853z" />
          </svg>
        </div>
        <div
          className={`absolute top-0.5 bottom-0.5 w-6 rounded-full bg-amber-200/80 transition-transform duration-200 ${
            effectiveTheme === "dark" ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </div>
    </div>
  );
}

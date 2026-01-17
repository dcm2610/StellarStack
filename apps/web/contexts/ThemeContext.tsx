"use client";

import { createContext, useContext } from "react";

interface ThemeContextValue {}

export const ThemeContext = createContext<ThemeContextValue>({});

export const useTheme = () => useContext(ThemeContext);

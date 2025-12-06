"use client";

import { createContext, useContext } from "react";

// Context to signal tooltips to close on scroll
export const ScrollContext = createContext<number>(0);
export const useScrollSignal = () => useContext(ScrollContext);

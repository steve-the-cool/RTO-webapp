/**
 * Client Entry Point for SPA
 *
 * This is the main entry point for the browser-side application.
 * - Mounts React + TanStack Router to the DOM
 * - Handles all routing client-side
 * - Communicates with Firebase for data
 * - No server-side rendering (pure SPA)
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import "@/styles.css";

// Get the router instance
const router = getRouter();

// Render the app to the DOM
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found. Make sure index.html has <div id='root'></div>");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

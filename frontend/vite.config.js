import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Il frontend gira sulla 5173 e fa da proxy verso il backend sulla 3001:
// così le chiamate /api/* del browser arrivano a Express senza problemi CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});

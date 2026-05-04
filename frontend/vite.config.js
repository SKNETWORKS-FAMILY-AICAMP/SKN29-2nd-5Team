import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
  [Vite 개발 서버 설정 블록]
  프론트엔드는 5173번 포트에서 실행하고, FastAPI 백엔드는 8000번 포트로 연결합니다.
*/
export default defineConfig({
  plugins: [react()],

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,

    /*
      [API 프록시 블록]
      fetch('/api/...') 방식으로 호출해도 FastAPI 서버로 전달되게 합니다.
      현재 api/client.js가 전체 주소를 사용하더라도, 추후 상대경로 API를 사용할 때 JSON 오류를 줄일 수 있습니다.
    */
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});

/*
  [API 기본 주소 블록]
  프론트에서 /api 같은 상대경로만 쓰면 Vite가 index.html을 반환해서
  JSON 오류가 생길 수 있습니다. 그래서 FastAPI 기본 주소를 명확히 고정합니다.
*/
const RAW_API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000";

export const API_BASE = RAW_API_BASE.replace(/\/$/, "");

/*
  [URL 생성 블록]
  배열 값은 콤마 문자열로 변환해서 백엔드 Query 파라미터와 맞춥니다.
*/
export function buildApiUrl(path, params = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE}${normalizedPath}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.join(","));
      }
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

/*
  [공통 GET 요청 블록]
  서버가 JSON이 아닌 HTML을 반환할 때 원인을 바로 알 수 있도록 오류 메시지를 자세히 표시합니다.
*/
export async function apiGet(path, params = {}, options = {}) {
  const url = buildApiUrl(path, params);

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: options.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw err;
    }

    throw new Error(
      `백엔드 서버에 연결하지 못했습니다. FastAPI가 실행 중인지 확인해 주세요. 요청 주소: ${url}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    const preview = text.slice(0, 160).replace(/\s+/g, " ");

    throw new Error(
      `서버가 JSON이 아닌 응답을 반환했습니다. 요청 주소: ${url} / 응답 앞부분: ${preview}`
    );
  }

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`JSON 파싱에 실패했습니다. 요청 주소: ${url}`);
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.detail || data?.message || `API 오류 ${response.status}`);
  }

  return data;
}
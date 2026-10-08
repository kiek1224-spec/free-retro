const API = "https://www.googleapis.com/drive/v3/files";
export function driveStore({ getToken, fetcher = fetch }) {
  async function request(url, options = {}) {
    let token;
    try {
      token = getToken();
    } catch (error) {
      error.transport = true;
      throw error;
    } // Automatic timers never open login popups.
    const response = await fetcher(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    }).catch((error) => {
      error.transport = true;
      throw error;
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? "Drive 로그인 시간이 만료됐습니다. 다시 연결하세요."
          : `Drive 동기화 실패 (${response.status})`,
      );
      error.transport = true;
      throw error;
    }
    return response;
  }
  return {
    async list() {
      const files = [];
      let page;
      do {
        const params = new URLSearchParams({
          spaces: "appDataFolder",
          pageSize: "100",
          q: "trashed = false and appProperties has { key='app' and value='free-retro' }",
          fields: "nextPageToken,files(id,appProperties,createdTime)",
          ...(page ? { pageToken: page } : {}),
        });
        const value = await (await request(`${API}?${params}`)).json();
        files.push(...(value.files || []));
        page = value.nextPageToken;
      } while (page);
      return files;
    },
    async read(id) {
      const response = await request(
        `${API}/${encodeURIComponent(id)}?alt=media`,
      );
      if (Number(response.headers.get("content-length")) > 100 * 1024 * 1024)
        throw new Error("클라우드 저장 파일이 너무 큽니다.");
      const text = await response.text();
      if (text.length > 100 * 1024 * 1024)
        throw new Error("클라우드 저장 파일이 너무 큽니다.");
      return JSON.parse(text);
    },
    async create(value) {
      const boundary = `free-retro-${crypto.randomUUID()}`;
      const metadata = {
        name: `save-${value.syncId}.json`,
        mimeType: "application/json",
        parents: ["appDataFolder"],
        appProperties: {
          app: "free-retro",
          syncId: value.syncId,
          romId: value.romId,
        },
      };
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(value)}\r\n--${boundary}--\r\n`,
      ]);
      return (
        await request(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
          {
            method: "POST",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          },
        )
      ).json();
    },
  };
}

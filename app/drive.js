// ROM Picker and opt-in app-data sync. Tokens remain in memory.
let token = null,
  expires = 0,
  granted = "",
  cloudAccount = null,
  loading;
function script(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.onload = resolve;
    el.onerror = () =>
      reject(new Error("Google 연결 스크립트를 불러오지 못했습니다."));
    document.head.append(el);
  });
}
async function ready() {
  if (!loading)
    loading = Promise.all([
      script("https://accounts.google.com/gsi/client"),
      script("https://apis.google.com/js/api.js"),
    ])
      .then(
        () =>
          new Promise((resolve, reject) =>
            gapi.load("picker", {
              callback: resolve,
              onerror: () =>
                reject(new Error("Google Picker를 불러오지 못했습니다.")),
            }),
          ),
      )
      .catch((e) => {
        loading = null;
        throw e;
      });
  return loading;
}
export function validConfig(c) {
  return (
    !!c &&
    /^[\w.-]+\.apps\.googleusercontent\.com$/.test(c.clientId) &&
    !!c.apiKey?.trim() &&
    /^\d+$/.test(c.project)
  );
}
export function disconnect() {
  if (token && window.google?.accounts?.oauth2)
    google.accounts.oauth2.revoke(token, () => {});
  token = null;
  expires = 0;
  granted = "";
  cloudAccount = null;
}
export async function prepareDrive() {
  await ready();
}
export async function pickGame(config) {
  if (!validConfig(config))
    throw new Error(
      "Drive 설정에서 클라이언트 ID, API 키, 프로젝트 번호를 입력하세요.",
    );
  if (!window.google?.accounts?.oauth2 || !window.google?.picker) {
    await ready();
    throw new Error(
      "Drive 연결 준비가 끝났습니다. 선택 버튼을 한 번 더 눌러주세요.",
    );
  }
  await authorize(config, "https://www.googleapis.com/auth/drive.file");
  const file = await new Promise((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.project)
      .setOrigin(location.origin)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve(data.docs[0]);
        if (data.action === google.picker.Action.CANCEL) resolve(null);
        if (data.action === "error")
          reject(new Error("Google Drive 파일 선택에 실패했습니다."));
      })
      .build();
    picker.setVisible(true);
  });
  if (!file) return null;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    if (response.status === 401) {
      token = null;
      expires = 0;
    }
    throw new Error(
      `Drive 다운로드 실패 (${response.status}). 연결과 파일 권한을 확인하세요.`,
    );
  }
  return new File([await response.blob()], file.name, {
    type: "application/octet-stream",
  });
}

async function authorize(config, scopes) {
  if (!validConfig(config)) throw new Error("먼저 Drive 설정을 저장하세요.");
  if (!window.google?.accounts?.oauth2) {
    await ready();
    throw new Error("Google 준비가 끝났습니다. 연결 버튼을 다시 누르세요.");
  }
  if (
    !token ||
    Date.now() >= expires ||
    scopes.split(" ").some((s) => !granted.split(" ").includes(s))
  )
    await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: scopes,
        callback: (r) => {
          if (r.error) {
            reject(new Error(r.error));
            return;
          }
          cloudAccount = null;
          granted = r.scope || "";
          token = r.access_token;
          expires = Date.now() + Math.max(0, r.expires_in - 60) * 1000;
          resolve();
        },
        error_callback: () =>
          reject(new Error("Google 로그인 창이 닫혔거나 차단됐습니다.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
}
export async function connectCloud(config, expectedAccount) {
  cloudAccount = null;
  await authorize(
    config,
    "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
  );
  if (
    !granted
      .split(" ")
      .includes("https://www.googleapis.com/auth/drive.appdata")
  )
    throw new Error(
      "세이브 동기화 권한이 승인되지 않았습니다. 로컬 저장은 계속 사용할 수 있습니다.",
    );
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok)
    throw new Error("연결한 Google 계정을 확인하지 못했습니다.");
  const id = (await response.json()).user?.permissionId;
  if (!id || (expectedAccount && id !== expectedAccount))
    throw new Error(
      "이 브라우저에 연결했던 Google 계정으로 로그인하세요. 다른 계정에는 저장을 전송하지 않습니다.",
    );
  cloudAccount = id;
  return id;
}
export function cloudToken() {
  if (
    !cloudAccount ||
    !token ||
    Date.now() >= expires ||
    !granted
      .split(" ")
      .includes("https://www.googleapis.com/auth/drive.appdata")
  )
    throw new Error(
      "자동 동기화가 대기 중입니다. Drive 세이브 연결 버튼으로 로그인하세요.",
    );
  return token;
}

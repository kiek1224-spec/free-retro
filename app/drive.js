// Selected-file access only. Tokens stay in memory; no proxy and no uploads.
let token = null,
  expires = 0,
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
  if (!token || Date.now() >= expires)
    await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (r) => {
          if (r.error) {
            reject(new Error(r.error));
            return;
          }
          token = r.access_token;
          expires = Date.now() + Math.max(0, r.expires_in - 60) * 1000;
          resolve();
        },
        error_callback: () =>
          reject(new Error("Google 로그인 창이 닫혔거나 차단됐습니다.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
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

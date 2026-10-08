import { romId, SYSTEMS } from "./model.js";
import { validOffset } from "./clock.js";
const MAX = 64 * 1024 * 1024;
async function encode(blob) {
  if (!blob?.size || blob.size > MAX)
    throw new Error(
      "클라우드 저장은 파일당 64 MB 이하를 지원합니다. 로컬 저장은 유지됩니다.",
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 32768)
    raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { bytes: btoa(raw), hash: await romId(blob) };
}
async function decode(value) {
  if (
    !value ||
    typeof value.bytes !== "string" ||
    value.bytes.length > MAX * 1.4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.bytes) ||
    value.bytes.length % 4 ||
    !/^[a-f0-9]{64}$/.test(value.hash)
  )
    throw new Error("클라우드 저장 형식이 올바르지 않습니다.");
  const blob = new Blob([
    Uint8Array.from(atob(value.bytes), (c) => c.charCodeAt(0)),
  ]);
  if (!blob.size || blob.size > MAX || (await romId(blob)) !== value.hash)
    throw new Error("클라우드 저장 검사값이 맞지 않습니다.");
  return blob;
}
export async function packState(state) {
  if ((state.data?.size || 0) + (state.battery?.size || 0) > MAX)
    throw new Error(
      "상태와 게임 내 저장의 합계는 64 MB 이하여야 합니다. 로컬 저장은 유지됩니다.",
    );
  return {
    format: "free-retro-cloud",
    version: 1,
    syncId: state.syncId,
    romId: state.romId,
    core: state.core,
    profile: state.profile,
    created: state.created,
    label: state.label,
    device: state.device || "",
    rtcOffset: state.rtcOffset || 0,
    state: await encode(state.data),
    battery: state.battery?.size ? await encode(state.battery) : null,
  };
}
export async function unpackState(value, expectedRom) {
  if (
    !value ||
    value.format !== "free-retro-cloud" ||
    value.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(value.romId) ||
    (expectedRom && value.romId !== expectedRom) ||
    !SYSTEMS[value.core] ||
    typeof value.syncId !== "string" ||
    !/^[a-zA-Z0-9-]{10,80}$/.test(value.syncId) ||
    typeof value.profile !== "string" ||
    !value.profile.trim() ||
    value.profile.length > 60 ||
    typeof value.label !== "string" ||
    value.label.length > 200 ||
    typeof value.device !== "string" ||
    value.device.length > 80 ||
    !Number.isFinite(value.created)
  )
    throw new Error("이 ROM과 맞지 않는 클라우드 저장입니다.");
  validOffset(value.rtcOffset);
  if (
    (value.state?.bytes?.length || 0) + (value.battery?.bytes?.length || 0) >
    Math.ceil(MAX / 3) * 4 + 8
  )
    throw new Error("클라우드 저장 합계가 64 MB를 넘습니다.");
  return {
    id: `cloud:${value.syncId}`,
    syncId: value.syncId,
    romId: value.romId,
    core: value.core,
    profile: value.profile,
    created: value.created,
    label: `☁ ${value.label}`,
    device: value.device,
    rtcOffset: value.rtcOffset,
    data: await decode(value.state),
    battery: value.battery ? await decode(value.battery) : null,
    cloudSaved: true,
  };
}
// Immutable remote records preserve concurrent saves. No PATCH or DELETE.
export function createSynchronizer({ store, remote, onStatus = () => {} }) {
  let running, runningRom;
  async function cycle(rom) {
    const uploaded = [],
      downloaded = [],
      rejected = [];
    onStatus("동기화 중…");
    const files = await remote.list();
    const known = new Set(files.map((f) => f.appProperties?.syncId));
    for (const state of await store.pendingStates()) {
      if (!known.has(state.syncId)) {
        await remote.create(await packState(state));
        known.add(state.syncId);
      }
      await store.acknowledge(state.id, state.syncId);
      uploaded.push(state.syncId);
    }
    for (const file of files) {
      if (
        !file.appProperties?.syncId ||
        (rom && file.appProperties.romId !== rom)
      )
        continue;
      if (await store.hasSnapshot(file.appProperties.syncId)) continue;
      try {
        const state = await unpackState(
          await remote.read(file.id),
          file.appProperties.romId,
        );
        if (state.syncId !== file.appProperties.syncId)
          throw new Error("클라우드 파일 식별자가 다릅니다.");
        await store.receive(state);
        downloaded.push(state);
      } catch (error) {
        // Transport/auth failure must retry, never be marked imported.
        if (error.transport) throw error;
        rejected.push({ id: file.id, error: error.message });
      }
    }
    onStatus(
      rejected.length
        ? `동기화 완료 · 손상된 파일 ${rejected.length}개 보류`
        : "동기화 완료",
    );
    return { uploaded, downloaded, rejected };
  }
  return {
    run(rom) {
      if (running) {
        if (runningRom === undefined || runningRom === rom) return running;
        return running.catch(() => {}).then(() => this.run(rom));
      }
      runningRom = rom;
      running = cycle(rom)
        .catch((error) => {
          onStatus(error.message);
          throw error;
        })
        .finally(() => {
          running = null;
        });
      return running;
    },
  };
}

const LIMIT = 100 * 365.25 * 86400000;
export function validOffset(value) {
  if (!Number.isFinite(value) || Math.abs(value) > LIMIT)
    throw new Error("게임 시간은 현재 시간에서 100년 이내로 설정하세요.");
  return value;
}
// Install only in the emulator iframe. UI timestamps and OAuth expiry stay real.
export function installClock(scope, initial = 0) {
  const NativeDate = scope.Date;
  let offset = validOffset(initial);
  function GameDate(...args) {
    if (!new.target)
      return new NativeDate(NativeDate.now() + offset).toString();
    return Reflect.construct(
      NativeDate,
      args.length ? args : [NativeDate.now() + offset],
      new.target,
    );
  }
  Object.setPrototypeOf(GameDate, NativeDate);
  GameDate.prototype = NativeDate.prototype;
  GameDate.now = () => NativeDate.now() + offset;
  scope.Date = GameDate;
  return {
    set(value) {
      offset = validOffset(value);
      return this.read();
    },
    read() {
      return { now: GameDate.now(), offset };
    },
  };
}

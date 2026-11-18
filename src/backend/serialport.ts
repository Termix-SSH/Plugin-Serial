type SerialPortModule = typeof import("serialport");

let loaded: Promise<SerialPortModule> | undefined;

function glibcVersion(): string | undefined {
  const report = process.report?.getReport() as
    { header?: { glibcVersionRuntime?: string } } | undefined;
  return report?.header?.glibcVersionRuntime;
}

/**
 * node-gyp-build checks /etc/alpine-release to pick the musl binary unless
 * LIBC is set, and the sandbox refuses that read. Node already knows.
 */
export function setLibc(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  glibc: () => string | undefined = glibcVersion,
): void {
  if (platform !== "linux" || env.LIBC) return;
  env.LIBC = glibc() ? "glibc" : "musl";
}

export function loadSerialPort(): Promise<SerialPortModule> {
  if (!loaded) {
    setLibc();
    loaded = import("serialport");
  }
  return loaded;
}

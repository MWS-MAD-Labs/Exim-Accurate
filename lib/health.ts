// What the health address answers. The version is the commit the image was built from, so a deploy can wait for it.
export function healthBody(env: Record<string, string | undefined> = process.env) {
  return { status: "ok", version: env.APP_VERSION?.trim() || "unknown" };
}

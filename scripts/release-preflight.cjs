const target = process.argv[2];
const intent = process.argv[3] || "build";

const has = (...names) => names.some((name) => Boolean(process.env[name]));
const missing = [];

if (!["mac", "win"].includes(target)) {
  throw new Error("用法: node scripts/release-preflight.cjs <mac|win> <build|publish>");
}

if (target === "mac") {
  if (!has("CSC_LINK", "CSC_NAME", "MACOS_CERTIFICATE")) {
    missing.push("macOS 签名证书: CSC_LINK、CSC_NAME 或 MACOS_CERTIFICATE");
  }
  const hasAppleIdAuth = has("APPLE_ID") && has("APPLE_APP_SPECIFIC_PASSWORD") && has("APPLE_TEAM_ID");
  const hasApiKeyAuth = has("APPLE_API_KEY") && has("APPLE_API_KEY_ID") && has("APPLE_API_ISSUER");
  const hasKeychainProfile = has("APPLE_KEYCHAIN_PROFILE");
  if (!hasAppleIdAuth && !hasApiKeyAuth && !hasKeychainProfile) {
    missing.push("Apple 公证凭据: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID，或 API Key/钥匙串 profile");
  }
}

if (target === "win" && !has("WIN_CSC_LINK", "CSC_LINK", "WINDOWS_CERTIFICATE")) {
  missing.push("Windows 代码签名证书: WIN_CSC_LINK、CSC_LINK 或 WINDOWS_CERTIFICATE");
}

if (intent === "publish" && !has("GH_TOKEN", "GITHUB_TOKEN")) {
  missing.push("GitHub 发布令牌: GH_TOKEN 或 GITHUB_TOKEN");
}

if (missing.length) {
  throw new Error(`发布前检查未通过:\n- ${missing.join("\n- ")}`);
}

console.log(`${target === "mac" ? "macOS" : "Windows"} ${intent === "publish" ? "发布" : "构建"}凭据检查通过。`);

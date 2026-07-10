# 正式发布配置

这份配置用于生成可公开分发的签名安装包。证书、密码和令牌都只放在本机钥匙串、环境变量或 GitHub Secrets，不要提交到 Git。

## macOS

需要 Apple Developer Program 的 `Developer ID Application` 证书，并需要 Apple 公证凭据。推荐使用下面的 Apple ID 方案：

- `CSC_NAME`：钥匙串中的 Developer ID 证书名称；也可以用 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 提供 `.p12` 证书。
- `APPLE_ID`：用于公证的 Apple ID。
- `APPLE_APP_SPECIFIC_PASSWORD`：该 Apple ID 的 app-specific password。
- `APPLE_TEAM_ID`：Apple Developer Team ID。
- `GH_TOKEN`：上传 GitHub Release 时需要。

完成配置后，在 macOS 执行：

```bash
npm run release:mac
```

这会签名、启用 Hardened Runtime、提交 Apple 公证并上传 DMG。只有构建而不上传时使用 `npm run release:mac:build`。

## Windows

需要受信任证书颁发机构签发的 Authenticode `.pfx` 代码签名证书：

- `WIN_CSC_LINK`：`.pfx` 文件路径或 base64 数据。
- `WIN_CSC_KEY_PASSWORD`：证书密码。
- `GH_TOKEN`：上传 GitHub Release 时需要。

在 Windows 执行：

```powershell
npm run release:win
```

只构建不上传时使用 `npm run release:win:build`。

## 自动发布

仓库已经包含 `.github/workflows/release.yml`。在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 配置以下 Secrets：

- `MACOS_CERTIFICATE`：Developer ID `.p12` 文件的 base64 内容。
- `MACOS_CERTIFICATE_PWD`：该 `.p12` 的密码。
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`：Apple 公证凭据。
- `WINDOWS_CERTIFICATE`：Authenticode `.pfx` 文件的 base64 内容。
- `WINDOWS_CERTIFICATE_PASSWORD`：该 `.pfx` 的密码。

Secrets 配好后，推送一个版本标签即可自动构建、签名、公证并创建 GitHub Release：

```bash
git tag v1.0.1
git push origin v1.0.1
```

macOS 公证需要有效的 Apple Developer 证书。Windows 新文件即使已经签名，也可能在早期下载时遇到 SmartScreen 的信誉提示；持续使用同一签名身份发布，或通过 Microsoft Store 分发，可以获得更好的用户安装体验。

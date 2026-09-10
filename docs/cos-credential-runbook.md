# COS 凭据受控录入

API 只从服务器受限文件 `/home/deploy/.config/sravx/cos.env` 读取 COS 访问密钥。该文件归 `deploy` 账户所有，权限为 600，不进入 Git、部署镜像、日志或前端代码。

在腾讯云 CAM 为 `sravx_api_cos` 创建 API 密钥后，SSH 登录服务器并执行：

```bash
sudo /opt/sravx-api/scripts/configure-cos-credentials.sh
sudo systemctl restart sravx-api
```

脚本会隐藏输入 SecretId 和 SecretKey；桶和地域默认分别为 `sravx-1419382340` 与 `ap-shanghai`。完成后只回复“COS 凭据已录入”，不要发送任何密钥。

之后由迁移流程执行一张无业务内容测试图片的签发与上传演练，并仅记录成功结论，不保存完整预签名 URL、文件内容或密钥。

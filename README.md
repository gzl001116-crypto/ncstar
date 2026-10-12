# fanstar

一个类似创作者社区的演示站点：浏览创作者、阅读动态、购买数字作品，并用 30 天会员解锁会员内容。会员不会自动续费，结账不会产生真实扣款。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173

## Cloudflare Pages

构建命令用 `npm run build`，部署命令用 `npx wrangler deploy`。`.npmrc` 会在生产环境安装里带上 Vite 和 TypeScript。单页路由由 `wrangler.jsonc` 的 `not_found_handling` 处理，不要再加指向 `/index.html` 的 `_redirects`，否则 Cloudflare 会报无限重定向。

## 演示账号

| 身份 | 邮箱 | 密码 |
| --- | --- | --- |
| 支持者 | fan@xingye.app | xingye123 |
| 创作者 | studio@xingye.app | xingye123 |

支持者账号已经关注了几位创作者，开通了林予的「窗边席」，购物袋里有一本小书，库里有一套胶片预设。创作者账号可以在创作台发动态、上架作品、修改主页。

账号、订单和会员都保存在浏览器本地。页脚的「重置演示数据」会回到初始状态。

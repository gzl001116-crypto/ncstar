import { Link } from "react-router-dom";
import { useTitle } from "../hooks";

export function About() {
  useTitle("关于 · 星页");
  return (
    <article className="page reading prose-page">
      <p className="kicker">关于</p>
      <h1>一个把作品交出去的地方</h1>
      <p>
        星页是面向创作者的社区演示。插画师、音乐人、摄影师、设计师和写作者可以发布动态、出售数字作品，并用 30 天会员让支持变得具体。
      </p>
      <p>
        公开动态是门口。会员用来解锁线稿、分轨、配方和还没装订的页。商店里的作品单独售卖，结账后进入支持者的库。会员按 30 天计算，不会自动续费。
      </p>
      <h2>钱怎么走</h2>
      <p>支持者支付页面上的标价。平台服务费是标价的 8%，从创作者实收里扣除。这个站点里的支付是演示，不会产生真实扣款，也不会保存银行卡。</p>
      <h2>和你的浏览器</h2>
      <p>注册、关注、评论、会员和购买都写在本地浏览器里。换一台设备就不会跟着走。页脚可以随时重置演示数据。</p>
      <p>
        <Link to="/explore">去探索</Link>
        <span> · </span>
        <Link to="/terms">使用条款</Link>
      </p>
    </article>
  );
}

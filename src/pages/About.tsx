import { Link } from "react-router-dom";
import { useTitle } from "../hooks";

export function About() {
  useTitle("关于 · 星页");
  return (
    <article className="page reading prose-page">
      <p className="kicker">关于</p>
      <h1>一个把作品交出去的地方</h1>
      <p>
        星页给插画师、音乐人、摄影师、设计师和写作者一个主页。注册时会向邮箱发送验证码。账号、动态、作品、关注和订单都保存在星页，换一台设备用同一个邮箱就能继续。
      </p>
      <p>
        公开动态是门口。会员用来解锁创作者写下的正文和附件。商店里的作品单独售卖，确认订单后进入支持者的库，可以下载创作者提供的正文。会员按 30 天计算，不会自动续费。
      </p>
      <h2>订单</h2>
      <p>
        支持者确认的是页面上的标价。平台服务费是标价的 8%，从创作者实收里扣除。订单会记在账号上，会员或作品立即生效。星页不保存银行卡号。
      </p>
      <p>
        <Link to="/explore">去探索</Link>
        <span> · </span>
        <Link to="/terms">使用条款</Link>
      </p>
    </article>
  );
}

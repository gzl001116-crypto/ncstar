import { Link } from "react-router-dom";
import { useTitle } from "../hooks";

export function NotFound() {
  useTitle("未找到 · 星页");
  return (
    <div className="page narrow">
      <div className="empty">
        <p className="kicker">404</p>
        <h1>这一页还没被装订</h1>
        <p>地址可能写错了，或者创作者还没来。</p>
        <Link to="/explore" className="btn btn-dark">
          回到探索
        </Link>
      </div>
    </div>
  );
}

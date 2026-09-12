import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";

export function Layout() {
  const { account, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ color: "white" }}>
          Monitoring SaaS
        </Link>
        <nav>
          <Link to="/">Monitors</Link>
          <Link to="/incidents">Incidents</Link>
          <Link to="/settings">Settings</Link>
          {account && <span className="account-name">{account.name}</span>}
          <button className="link-btn" onClick={logout}>
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

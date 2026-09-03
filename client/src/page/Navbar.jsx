import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-container">

        {/* LOGO */}
        <Link to="/" className="brand">
          <div className="brand-logo">
            CS
          </div>

          <div className="brand-text">
            <span>City Scholarship</span>
            <small>Management System</small>
          </div>
        </Link>

        {/* NAVIGATION */}
        <nav className="nav-links">
          <a href="#home" className="nav-link active">
            Home
          </a>

          <a href="#eligibility" className="nav-link">
            Eligibility & Requirements
          </a>

          <a href="#how-to-apply" className="nav-link">
            How to Apply
          </a>

          <a href="#guidelines" className="nav-link">
            Guidelines
          </a>
        </nav>

        {/* LOGIN */}
        <Link to="/login" className="login-button">
          Login / Register
        </Link>

      </div>
    </header>
  );
}
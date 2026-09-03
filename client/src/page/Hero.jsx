export default function Hero() {
    return (
      <section id="home" className="hero">
  
        {/* DARK OVERLAY */}
        <div className="hero-overlay"></div>
  
        <div className="hero-container">
  
          {/* LEFT CONTENT */}
          <div className="hero-content">
  
            {/* APPLICATION BADGE */}
            <div className="application-badge">
              <span className="badge-dot"></span>
              AY 2025–2026 Applications Now Open
            </div>
  
            {/* HEADING */}
            <h1>
              Empowering Students.
              <br />
              <span>Building Brighter Futures.</span>
            </h1>
  
            {/* DESCRIPTION */}
            <p>
              The City Scholarship Program connects deserving students
              with educational opportunities. Transparent, accessible,
              and student-focused.
            </p>
  
            {/* BUTTONS */}
            <div className="hero-buttons">
  
              <a href="#eligibility" className="primary-button">
                Check Eligibility
                <span>→</span>
              </a>
  
              <a href="#how-to-apply" className="secondary-button">
                How to Apply
              </a>
  
            </div>
  
          </div>
  
        </div>
      </section>
    );
  }
export default function ScholarshipProgram() {
    const benefits = [
      "Covers tuition and miscellaneous fees",
      "Monthly living allowance for active scholars",
      "Annual renewal for continuing scholars",
      "Open to city residents pursuing undergraduate studies",
    ];
  
    return (
      <section id="eligibility" className="program-section">
        <div className="program-container">
  
          {/* LEFT */}
          <div className="program-info">
  
            <div className="section-label">
              CITY SCHOLARSHIP PROGRAM
            </div>
  
            <h2>
              One Scholarship. Countless
              <br />
              Opportunities.
            </h2>
  
            <p className="program-description">
              The City Scholarship Program is a government-funded initiative
              that provides full financial support to qualified residents
              pursuing higher education. It covers tuition, allowances,
              and book stipends for approved scholars.
            </p>
  
            <div className="benefits-list">
              {benefits.map((benefit, index) => (
                <div className="benefit" key={index}>
                  <span className="check">✓</span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
  
            {/* MINI STATS */}
            <div className="program-stats">
  
              <div className="program-stat">
                <strong>₱30,000</strong>
                <span>per semester</span>
              </div>
  
              <div className="program-stat">
                <strong>500</strong>
                <span>available slots</span>
              </div>
  
              <div className="program-stat">
                <strong>Jul 31</strong>
                <span>application deadline</span>
              </div>
  
            </div>
  
          </div>
  
  
          {/* RIGHT CARD */}
          <div className="program-card">
  
            <div className="program-card-header">
  
              <div className="program-card-title">
  
                <div className="award-icon">
                  ♙
                </div>
  
                <div>
                  <strong>City Scholarship Program</strong>
                  <span>AY 2025–2026 · Now Open</span>
                </div>
  
              </div>
  
              <div className="open-badge">
                ● Open
              </div>
  
            </div>
  
  
            <div className="program-details">
  
              <div className="detail-row">
                <span>Application Period</span>
                <strong>June 1 – July 31, 2025</strong>
              </div>
  
              <div className="detail-row">
                <span>Minimum GWA</span>
                <strong>2.25 or higher</strong>
              </div>
  
              <div className="detail-row">
                <span>Residency Requirement</span>
                <strong>City resident, 2+ years</strong>
              </div>
  
              <div className="detail-row">
                <span>Available Slots</span>
                <strong>500 scholars</strong>
              </div>
  
              <div className="detail-row">
                <span>Benefit</span>
                <strong>₱30,000 per semester</strong>
              </div>
  
            </div>
  
  
            <button className="qualify-button">
              Check if You Qualify
              <span>→</span>
            </button>
  
          </div>
  
        </div>
      </section>
    );
  }
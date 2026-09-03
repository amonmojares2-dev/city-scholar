const statistics = [
    {
      icon: "♙",
      number: "12,847",
      label: "Graduates Supported",
    },
    {
      icon: "♧",
      number: "3,204",
      label: "Active Scholars",
    },
    {
      icon: "▣",
      number: "500",
      label: "Slots Available",
    },
    {
      icon: "✓",
      number: "99.2%",
      label: "Application Success Rate",
    },
  ];
  
  export default function Stats() {
    return (
      <section className="stats-section">
        <div className="stats-container">
  
          {statistics.map((stat, index) => (
            <div className="stat-item" key={index}>
  
              <div className="stat-icon">
                {stat.icon}
              </div>
  
              <div className="stat-number">
                {stat.number}
              </div>
  
              <div className="stat-label">
                {stat.label}
              </div>
  
            </div>
          ))}
  
        </div>
  
        {/* AI ASSISTANT */}
        <button className="ai-assistant">
  
          <div className="ai-icon">
            AI
          </div>
  
          <div className="ai-text">
            <strong>AI Assistant</strong>
            <span>Ask me anything</span>
          </div>
  
          <div className="ai-arrow">
            ›
          </div>
  
        </button>
      </section>
    );
  }
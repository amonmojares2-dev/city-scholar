const announcements = [
    {
      type: "Application Open",
      date: "May 28, 2025",
      title: "Scholarship Applications Now Open for AY 2025–2026",
      description:
        "The City Scholarship Office is pleased to announce that applications are now open until July 31, 2025.",
    },
    {
      type: "Reminder",
      date: "May 20, 2025",
      title: "Document Submission Deadline Extended to June 15",
      description:
        "Due to high demand, the document submission deadline for continuing scholars has been extended.",
    },
    {
      type: "Event",
      date: "May 15, 2025",
      title: "Scholarship Orientation Seminar – June 5, 2025",
      description:
        "All new applicants are encouraged to attend the online orientation seminar on scholarship guidelines and requirements.",
    },
  ];
  
  export default function Announcements() {
    return (
      <section className="announcements-section">
  
        <div className="announcements-container">
  
          <div className="section-label">
            LATEST UPDATES
          </div>
  
          <h2>Announcements</h2>
  
  
          <div className="announcement-list">
  
            {announcements.map((announcement, index) => (
              <article
                className="announcement"
                key={index}
              >
  
                <div className="announcement-line"></div>
  
                <div className="announcement-content">
  
                  <div className="announcement-meta">
  
                    <span className="announcement-type">
                      {announcement.type}
                    </span>
  
                    <span>
                      {announcement.date}
                    </span>
  
                  </div>
  
                  <h3>
                    {announcement.title}
                  </h3>
  
                  <p>
                    {announcement.description}
                  </p>
  
                </div>
  
                <span className="announcement-arrow">
                  ›
                </span>
  
              </article>
            ))}
  
          </div>
  
        </div>
  
      </section>
    );
  }
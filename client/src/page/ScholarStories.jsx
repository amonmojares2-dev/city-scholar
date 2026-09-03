const stories = [
    {
      initials: "JR",
      name: "Jasmine Reyes",
      details: "Scholar, 2022 · PHINMA University of Pangasinan",
      text:
        '"The City Scholarship changed my life. The entire process was transparent and the office was always responsive to my questions. I\'m now in my third year of BS Computer Science."',
    },
    {
      initials: "CM",
      name: "Carlo Mendoza",
      details: "Scholar, 2021 · University of Luzon",
      text:
        '"Coming from a family with limited income, I never thought college was within reach. This scholarship didn\'t just cover tuition — it gave me confidence and a future."',
    },
    {
      initials: "LT",
      name: "Liana Torres",
      details: "Scholar, 2023 · Systems Technology Institute College",
      text:
        '"I completed my course and landed a job immediately after. The portal made renewals easy and I always knew what documents I needed."',
    },
  ];
  
  export default function ScholarStories() {
    return (
      <section className="stories-section">
  
        <div className="stories-header">
  
          <div className="section-label">
            SCHOLAR STORIES
          </div>
  
          <h2>Lives Changed Through Scholarship</h2>
  
        </div>
  
  
        <div className="stories-container">
  
          {stories.map((story) => (
            <article className="story-card" key={story.initials}>
  
              <div className="stars">
                ★ ★ ★ ★ ★
              </div>
  
              <p className="story-text">
                {story.text}
              </p>
  
              <div className="story-author">
  
                <div className="author-avatar">
                  {story.initials}
                </div>
  
                <div>
                  <strong>{story.name}</strong>
                  <span>{story.details}</span>
                </div>
  
              </div>
  
            </article>
          ))}
  
        </div>
  
      </section>
    );
  }
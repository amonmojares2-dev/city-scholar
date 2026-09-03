const steps = [
    {
      number: "01",
      title: "Check Eligibility",
      description:
        "Review the scholarship requirements and confirm you meet all criteria before starting your application.",
    },
    {
      number: "02",
      title: "Create an Account",
      description:
        "Register with your basic information to access the scholarship portal and track your application.",
    },
    {
      number: "03",
      title: "Submit Requirements",
      description:
        "Upload all required documents through the secure portal. Our system tracks every submission.",
    },
    {
      number: "04",
      title: "Track Application",
      description:
        "Monitor your application status in realtime and respond to any requests from the scholarship office.",
    },
  ];
  
  export default function HowToApply() {
    return (
      <section id="how-to-apply" className="apply-section">
  
        <div className="apply-header">
  
          <div className="section-label">
            SIMPLE PROCESS
          </div>
  
          <h2>How to Apply in 4 Steps</h2>
  
        </div>
  
  
        <div className="steps-container">
  
          {steps.map((step, index) => (
            <div className="step" key={step.number}>
  
              <div className="step-number">
                {step.number}
              </div>
  
              <div className="step-content">
  
                <h3>{step.title}</h3>
  
                <p>{step.description}</p>
  
              </div>
  
              {index < steps.length - 1 && (
                <div className="step-line"></div>
              )}
  
            </div>
          ))}
  
        </div>
  
  
        <button className="start-application">
          Start Your Application
          <span>→</span>
        </button>
  
      </section>
    );
  }
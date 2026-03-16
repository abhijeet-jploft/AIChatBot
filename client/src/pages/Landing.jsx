import { useEffect } from 'react';

export default function Landing() {
  useEffect(() => {
    const h = document.querySelector('.landing-hero');
    if (h) h.style.minHeight = `${window.innerHeight}px`;
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="container">
          <nav className="d-flex align-items-center justify-content-between py-3">
            <a href="/" className="landing-logo text-decoration-none fw-bold">
              JP Loft
            </a>
            <div className="d-flex align-items-center gap-3">
              <a href="#services" className="text-decoration-none small text-dark">Services</a>
              <a href="#contact" className="text-decoration-none small text-dark">Contact</a>
            </div>
          </nav>
        </div>
      </header>

      <section className="landing-hero d-flex align-items-center">
        <div className="container text-center py-5">
          <h1 className="display-5 fw-bold mb-3">
            Build your digital product with confidence
          </h1>
          <p className="lead text-secondary mx-auto" style={{ maxWidth: 560 }}>
            We design and develop websites, web apps, and mobile apps. From idea to launch—talk to our team and get a clear path forward.
          </p>
          <a href="#contact" className="btn btn-primary btn-lg mt-3 px-4">
            Get in touch
          </a>
        </div>
      </section>

      <section id="services" className="py-5">
        <div className="container py-4">
          <h2 className="text-center fw-bold mb-4">What we do</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-body p-4">
                  <h5 className="card-title">Web & mobile apps</h5>
                  <p className="card-text text-secondary small mb-0">
                    Custom websites, web applications, and native or cross-platform mobile apps tailored to your business.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-body p-4">
                  <h5 className="card-title">AI & consulting</h5>
                  <p className="card-text text-secondary small mb-0">
                    Strategy, discovery, and implementation support so you move smarter and scale faster.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-body p-4">
                  <h5 className="card-title">Discovery & design</h5>
                  <p className="card-text text-secondary small mb-0">
                    From idea to scope: we help you define features, timeline, and the right tech stack.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-5 bg-light">
        <div className="container py-4 text-center">
          <h2 className="fw-bold mb-3">Let&apos;s talk</h2>
          <p className="text-secondary mb-4">
            Have a project in mind? Use the chat widget or reach out—we&apos;re here to help.
          </p>
          <p className="small text-muted mb-0">
            © {new Date().getFullYear()} JP Loft. All rights reserved.
          </p>
        </div>
      </section>
    </div>
  );
}

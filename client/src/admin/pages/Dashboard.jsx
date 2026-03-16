import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Dashboard</h5>
      <div className="row g-3">
        <div className="col-md-6">
          <Link to="settings" className="text-decoration-none">
            <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-body">
                <h6 className="card-title" style={{ color: 'var(--chat-text-heading)' }}>Settings</h6>
                <p className="card-text small text-muted mb-0">
                  Change display name, icon, and greeting message
                </p>
              </div>
            </div>
          </Link>
        </div>
        <div className="col-md-6">
          <Link to="training" className="text-decoration-none">
            <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-body">
                <h6 className="card-title" style={{ color: 'var(--chat-text-heading)' }}>Training</h6>
                <p className="card-text small text-muted mb-0">
                  Scrape website and train AI with your data
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

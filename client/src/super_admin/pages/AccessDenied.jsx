import { Link } from 'react-router-dom';

export default function AccessDenied() {
  return (
    <div className="sa-page">
      <div className="sa-panel sa-access-denied">
        <h2 className="sa-page-title">Access Denied</h2>
        <p className="sa-text-muted sa-mb">
          Your current staff role does not allow this module. Contact a super admin if your access needs to change.
        </p>
        <Link to="/super-admin/staff" className="sa-btn sa-btn-primary sa-btn-sm">Return to staff workspace</Link>
      </div>
    </div>
  );
}
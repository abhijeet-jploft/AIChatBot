import { Link } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { allowedModules } from '../lib/permissions';

const MODULE_LINKS = {
  dashboard: '/super-admin',
  business_management: '/super-admin/companies',
  user_management: '/super-admin/staff-management',
  ai_configuration: '/super-admin/companies',
  ai_mode_lead_generation: '/super-admin/companies',
  ai_mode_meeting_booking: '/super-admin/companies',
  ai_mode_product_recommendation: '/super-admin/companies',
  ai_mode_customer_support: '/super-admin/companies',
  ai_mode_mixed_mode: '/super-admin/companies',
  voice_management: '/super-admin/companies',
  api_management: '/super-admin/companies',
  conversation_monitoring: '/super-admin/support-tickets',
  analytics: '/super-admin/reports',
  billing_revenue: '/super-admin/reports',
  subscription_management: '/super-admin/reports',
  support_tickets: '/super-admin/support-tickets',
  system_settings: '/super-admin/monitoring',
};

export default function StaffWorkspace() {
  const { admin } = useSuperAuth();
  const allAssignedModules = allowedModules(admin);
  const modules = allAssignedModules.filter((moduleDef) => MODULE_LINKS[moduleDef.key]);
  const nonNavigableModules = allAssignedModules.filter((moduleDef) => !MODULE_LINKS[moduleDef.key]);

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h2 className="sa-page-title">Staff Workspace</h2>
          <p className="sa-text-muted sa-mb">
            Signed in as {admin?.name.toUpperCase() || admin?.email}. Your roles: <strong>{admin?.roleName || 'Staff'}</strong>.
          </p>
        </div>
      </div>

      {admin?.mustChangePassword ? (
        <div className="sa-panel sa-panel-info">
          <h3 className="sa-panel-title">Password change required</h3>
          <p className="sa-text-muted sa-mb">
            You must update your password before any staff permissions are activated.
          </p>
          <Link to="/super-admin/profile" className="sa-btn sa-btn-primary sa-btn-sm">Go to profile</Link>
        </div>
      ) : null}

      <div className="sa-kpi-grid sa-kpi-grid-sm">
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Roles</div>
          <div className="sa-kpi-value" style={{ fontSize: 20 }}>{admin?.roleName || 'Staff'}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Accessible Modules</div>
          <div className="sa-kpi-value">{allAssignedModules.length}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-label">Sensitive Data Access</div>
          <div className="sa-kpi-value" style={{ fontSize: 20 }}>
            {allAssignedModules.some((moduleDef) => moduleDef.sensitive) ? 'Granted' : 'Restricted'}
          </div>
        </div>
      </div>

      <div className="sa-module-card-grid">
        {allAssignedModules.length === 0 ? (
          <div className="sa-panel">
            <div className="sa-empty">No modules have been assigned to this role yet.</div>
          </div>
        ) : (
          <>
            {modules.map((moduleDef) => (
              <Link key={moduleDef.key} to={MODULE_LINKS[moduleDef.key]} className="sa-module-card">
                <div className="sa-module-card-title">{moduleDef.label}</div>
                <div className="sa-module-card-meta">
                  {moduleDef.sensitive ? 'Sensitive access' : 'Operational access'}
                </div>
              </Link>
            ))}
            {nonNavigableModules.length > 0 ? (
              <div className="sa-panel">
                <div className="sa-text-muted">
                  Some assigned modules are context-based and open from company-specific screens.
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {nonNavigableModules.map((moduleDef) => (
                    <span key={moduleDef.key} className="sa-badge">
                      {moduleDef.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
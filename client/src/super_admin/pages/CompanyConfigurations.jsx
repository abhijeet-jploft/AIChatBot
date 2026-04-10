import { Link, useParams } from 'react-router-dom';

const CONFIG_MODULES = [
  {
    id: 'settings',
    title: 'Company Settings',
    description: 'Name, widget behavior, lead notifications, safety, escalation, and all general settings.',
    path: 'settings',
  },
  {
    id: 'api',
    title: 'API Settings',
    description: 'AI provider/model and company override keys (Anthropic, Gemini, ElevenLabs).',
    path: 'api-settings',
  },
  {
    id: 'voice',
    title: 'Voice Settings',
    description: 'Voice mode, response voice, preview, and custom voice training controls.',
    path: 'voice-settings',
  },
  {
    id: 'admin-settings-access',
    title: 'Admin Settings Access',
    description: 'Control which configuration sections and preset voices the company admin can see.',
    path: 'admin-settings-access',
  },
  {
    id: 'theme',
    title: 'Theme',
    description: 'Widget colors, visual brand identity, and style personalization.',
    path: 'theme-settings',
  },
  {
    id: 'mode',
    title: 'AI Mode',
    description: 'Conversation behavior and mode strategy for the assistant.',
    path: 'mode-settings',
  },
  {
    id: 'virtual-assistant',
    title: 'Virtual Assistant',
    description: 'LiveAvatar virtual assistant settings, avatar, context, voice source, and sandbox mode.',
    path: 'virtual-assistant',
  },
];

export default function CompanyConfigurations() {
  const { companyId } = useParams();

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}`} className="sa-breadcrumb">← Back</Link>
          <h2 className="sa-page-title">All Admin Configurations</h2>
          <p className="sa-text-muted sa-mb">
            Super admin can manage every configuration module by auto-login handoff into the exact admin page.
          </p>
        </div>
      </div>

      <div className="sa-dashboard-cols">
        {CONFIG_MODULES.map((m) => (
          <div key={m.id} className="sa-panel">
            <h3 className="sa-panel-title">{m.title}</h3>
            <p className="sa-text-muted sa-mb">{m.description}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/super-admin/companies/${companyId}/${m.path}`} className="sa-btn sa-btn-primary sa-btn-sm">
                Manage here
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

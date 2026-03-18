import type { AuthForm } from './network-form.js';

type AuthScreenProps = {
  phase: 'bootstrap' | 'login';
  authMode: 'signin' | 'signup';
  form: AuthForm;
  onModeChange: (mode: 'signin' | 'signup') => void;
  onFieldChange: (field: keyof AuthForm, value: string) => void;
  onSubmit: (mode: 'bootstrap' | 'login' | 'register') => void;
};

export function AuthScreen(props: AuthScreenProps) {
  const primaryAction =
    props.phase === 'bootstrap' ? 'bootstrap' : props.authMode === 'signup' ? 'register' : 'login';

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-card__intro">
          <p className="eyebrow">Pulsete</p>
          <h1>{props.phase === 'bootstrap' ? 'Bootstrap the first account' : 'Welcome back'}</h1>
          <p className="muted">A self-hosted web IRC client with a HexChat-style workspace.</p>
        </div>
        <div className="auth-card__form">
          {props.phase === 'login' ? (
            <div className="auth-tabs">
              <button
                className={`button ${props.authMode === 'signin' ? 'button--primary' : ''}`}
                onClick={() => props.onModeChange('signin')}
              >
                Sign in
              </button>
              <button
                className={`button ${props.authMode === 'signup' ? 'button--primary' : ''}`}
                onClick={() => props.onModeChange('signup')}
              >
                Create account
              </button>
            </div>
          ) : null}
          <label>
            Username
            <input
              value={props.form.username}
              onChange={(event) => props.onFieldChange('username', event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={props.form.password}
              onChange={(event) => props.onFieldChange('password', event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <div className="row row--actions">
            <button className="button button--primary" onClick={() => props.onSubmit(primaryAction)}>
              {props.phase === 'bootstrap' ? 'Create account' : props.authMode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

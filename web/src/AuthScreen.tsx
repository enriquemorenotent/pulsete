import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Separator } from '@/components/ui/separator.js';
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
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <Card className="flex h-[min(calc(100dvh-2rem),30rem)] w-full max-w-[28rem] flex-col overflow-hidden">
        <CardHeader className="gap-3 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pulsete IRC</p>
              <CardTitle>{props.phase === 'bootstrap' ? 'Bootstrap Account' : 'Sign In'}</CardTitle>
            </div>
            <Badge variant="outline">Operator</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {props.phase === 'bootstrap'
              ? 'Create the first account for this host.'
              : 'Authenticate to open the IRC workspace.'}
          </p>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {props.phase === 'login' ? (
            <div className="grid grid-cols-2 gap-1 rounded-sm border border-border bg-secondary p-1">
              <Button
                variant={props.authMode === 'signin' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-center"
                aria-pressed={props.authMode === 'signin'}
                onClick={() => props.onModeChange('signin')}
              >
                Existing
              </Button>
              <Button
                variant={props.authMode === 'signup' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-center"
                aria-pressed={props.authMode === 'signup'}
                onClick={() => props.onModeChange('signup')}
              >
                New
              </Button>
            </div>
          ) : null}

          <Separator />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                value={props.form.username}
                onChange={(event) => props.onFieldChange('username', event.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={props.form.password}
                onChange={(event) => props.onFieldChange('password', event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {props.phase === 'bootstrap'
                ? 'This account unlocks the rest of the workspace.'
                : 'Credentials are checked against the local Pulsete host.'}
            </p>
            <Button onClick={() => props.onSubmit(primaryAction)}>
              {props.phase === 'bootstrap' ? 'Create account' : props.authMode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

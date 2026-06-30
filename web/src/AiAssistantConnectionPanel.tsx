import { useCallback, useEffect, useState } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import type { AiAssistantProviderStatus } from '../../shared/protocol-ai.js';
import { Button } from '@/components/ui/button.js';
import { aiAssistantApi } from './ai-assistant-client.js';

type AiAssistantConnectionPanelProps = {
  compact?: boolean;
  onStatusChange?: (status: AiAssistantProviderStatus) => void;
};

export function AiAssistantConnectionPanel(props: AiAssistantConnectionPanelProps) {
  const [error, setError] = useState('');
  const [instructions, setInstructions] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const nextStatus = await aiAssistantApi.status();
      setStatus(nextStatus);
      if (nextStatus.connected) {
        setInstructions(null);
      }
      props.onStatusChange?.(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to check assistant login');
    }
  }, [props.onStatusChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!instructions || status?.connected) {
      return;
    }
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [instructions, refresh, status?.connected]);

  const signIn = async () => {
    setPending(true);
    setError('');
    try {
      const response = await aiAssistantApi.login();
      setInstructions(response.status.connected ? null : response.instructions);
      setStatus(response.status);
      props.onStatusChange?.(response.status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start OpenAI login');
    } finally {
      setPending(false);
    }
  };

  const detail = error || status?.detail || 'Checking Codex OpenAI login...';
  const connected = status?.connected === true;
  const signInLabel = instructions ? 'Show sign-in code' : 'Sign in with OpenAI';
  const showInstructions = Boolean(instructions && !connected);

  if (props.compact && connected && !error) {
    return null;
  }

  return (
    <section className={props.compact ? 'space-y-3' : 'space-y-4 rounded-sm border border-white/[0.06] bg-black/10 p-3'}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground/92">AI Assistant</h3>
        <p className={error ? 'text-[12px] text-amber-200' : 'text-[12px] text-muted-foreground'}>
          {detail}
        </p>
      </div>
      {showInstructions ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm border border-white/[0.06] bg-black/20 p-2 text-[11px] leading-4 text-foreground/78">
          {instructions}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <Button size="sm" onClick={signIn} disabled={pending}>
            <LogIn />
            {signInLabel}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          <RefreshCw />
          Check status
        </Button>
      </div>
    </section>
  );
}

import type { ChannelState, NetworkProfile } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';

type NicklistPanelProps = {
  network: NetworkProfile | null;
  channel: ChannelState;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export function NicklistPanel(props: NicklistPanelProps) {
  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Nicklist</p>
            <h2 className="text-sm font-semibold tracking-tight">Users</h2>
          </div>
          <Badge variant="secondary">{props.channel.users.length}</Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {props.channel.users.length === 0 ? (
              <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                No nick list yet.
              </div>
            ) : (
              props.channel.users.map((nick) => (
                <button
                  key={nick}
                  className="flex w-full items-center justify-between border-b border-border/70 px-2 py-1.5 text-left text-[13px] text-foreground last:border-b-0 hover:bg-accent"
                  onClick={() => props.network && props.onSelectNick(props.network, nick)}
                >
                  <span>{nick}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Query</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </aside>
  );
}

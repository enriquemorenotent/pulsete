import type { ChannelState, NetworkProfile } from '../../shared/protocol.js';
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
          <h2 className="text-sm font-semibold tracking-tight">Users</h2>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {props.channel.users.length === 0 ? (
              <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                No users yet.
              </div>
            ) : (
              props.channel.users.map((nick) => (
                <button
                  key={nick}
                  className="flex w-full items-center border-b border-border/70 px-2 py-1.5 text-left text-[13px] text-foreground last:border-b-0 hover:bg-accent"
                  onClick={() => props.network && props.onSelectNick(props.network, nick)}
                >
                  <span>{nick}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </aside>
  );
}

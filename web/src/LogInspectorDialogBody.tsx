import { useMemo, type FormEvent, type RefObject } from 'react';
import { Search } from 'lucide-react';
import type { ChatMessage, NetworkProfile } from '../../shared/protocol-chat.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { HistorySearchResults } from './HistorySearchDialogResults.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { defaultMessageDisplayMode } from './message-display-mode.js';

export const allNetworksValue = '__all__';

export type LogInspectorDialogBodyProps = {
  expandedMessageId: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  networkValue: string;
  networks: NetworkProfile[];
  query: string;
  searchState: HistorySearchState;
  target: string;
  onNetworkChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onResultToggle: (messageId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTargetChange: (value: string) => void;
};

export function LogInspectorDialogBody(props: LogInspectorDialogBodyProps) {
  const networkNamesById = useMemo(
    () => new Map(props.networks.map((network) => [network.id, network.name])),
    [props.networks],
  );
  const renderResultMeta = (message: ChatMessage) => (
    <>
      <Badge variant="secondary" className="normal-case tracking-normal">
        {networkNamesById.get(message.networkId) ?? message.networkId}
      </Badge>
      <Badge variant="outline" className="normal-case tracking-normal">
        {message.target}
      </Badge>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
        <DialogTitle>Log inspector</DialogTitle>
        <DialogDescription>All saved logs</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={props.onSubmit}
        className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 md:flex-row"
      >
        <Input
          ref={props.inputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder="Search all logs"
          aria-label="Search all logs"
          className="md:flex-1"
        />
        <Select value={props.networkValue} onValueChange={props.onNetworkChange}>
          <SelectTrigger size="sm" className="w-full md:w-44" aria-label="Filter logs by network">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={allNetworksValue}>All networks</SelectItem>
              {props.networks.map((network) => (
                <SelectItem key={network.id} value={network.id}>
                  {network.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          value={props.target}
          onChange={(event) => props.onTargetChange(event.currentTarget.value)}
          placeholder="Conversation"
          aria-label="Filter logs by conversation"
          className="md:w-44"
        />
        <Button type="submit" disabled={!props.query.trim() || props.searchState.status === 'loading'}>
          <Search />
          Search
        </Button>
      </form>
      <ScrollArea className="min-h-0 flex-1">
        <HistorySearchResults
          expandedMessageId={props.expandedMessageId}
          mode={defaultMessageDisplayMode}
          renderResultMeta={renderResultMeta}
          searchState={props.searchState}
          onOpenChannel={() => undefined}
          onResultToggle={props.onResultToggle}
        />
      </ScrollArea>
    </div>
  );
}

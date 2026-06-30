import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { InspectorHeader, InspectorPanel, MetadataRow } from './RightSidebarInspector.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerStatusLabel,
} from './network-manager-dialog-model.js';
import { summarizeHistoryCapabilities } from './server-history-capabilities.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type { NetworkProfile, NetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type { WorkspaceView } from './workspace-types.js';

export function ServerProfileSidebar(props: {
  network: WorkspaceView['selectedNetwork'];
  fallbackNetwork: WorkspaceView['selectedNetwork'];
  runtime: WorkspaceView['selectedRuntime'];
  onEdit: () => void;
  onSaveNotes: (
    network: NonNullable<WorkspaceView['selectedNetwork']>,
    notes: string,
  ) => Promise<NetworkProfile | null>;
}) {
  const network = props.network ?? props.fallbackNetwork;
  if (!network) {
    return null;
  }
  return (
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Profile"
        title={network.name}
        subtitle={`${network.host}:${network.port}${network.tls ? ' - SSL/TLS' : ''}`}
        actions={<EditProfileButton disabled={!props.network} onClick={props.onEdit} />}
      />
      <ConnectionAccordion network={network} runtime={props.runtime} />
      <HistoryAccordion capabilities={props.runtime?.capabilities} />
      <ServerCapabilityInspector capabilities={props.runtime?.capabilities} />
      <NotesAccordion network={network} onSaveNotes={props.onSaveNotes} />
    </InspectorPanel>
  );
}

function EditProfileButton(props: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 border border-white/[0.055] bg-transparent px-2 text-muted-foreground/86 hover:border-white/12 hover:bg-white/[0.045] hover:text-foreground"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      Edit
    </Button>
  );
}

function ConnectionAccordion(props: {
  network: NetworkProfile;
  runtime: WorkspaceView['selectedRuntime'];
}) {
  return (
    <ServerInspectorAccordionItem title="Connection">
      <dl className="space-y-1.5">
        <MetadataRow label="Status" value={getNetworkManagerStatusLabel(props.runtime)} />
        <MetadataRow label="Nick" value={props.runtime?.nick ?? props.network.nick} />
        <MetadataRow label="Auth" value={getNetworkManagerAuthLabel(props.network)} />
        <MetadataRow label="Autojoin" value={getNetworkManagerAutoJoinLabel(props.network)} />
      </dl>
    </ServerInspectorAccordionItem>
  );
}

function HistoryAccordion(props: { capabilities?: NetworkRuntimeCapabilities | null }) {
  const summary = summarizeHistoryCapabilities(props.capabilities);
  return (
    <ServerInspectorAccordionItem title="History">
      <dl className="space-y-1.5">
        <MetadataRow label="Backfill" value={summary.backfill} />
        <MetadataRow label="Page size" value={summary.pageSize} />
        <MetadataRow label="End marker" value={summary.endMarker} />
        <MetadataRow label="Event replay" value={summary.eventReplay} />
        <MetadataRow label="Retention" value={summary.retention} />
      </dl>
    </ServerInspectorAccordionItem>
  );
}

function NotesAccordion(props: {
  network: NetworkProfile;
  onSaveNotes: (network: NetworkProfile, notes: string) => Promise<NetworkProfile | null>;
}) {
  return (
    <ServerInspectorAccordionItem title="Notes">
      <AutosaveNotesEditor
        id="server-profile-notes"
        notes={props.network.notes ?? ''}
        onSave={(notes) => props.onSaveNotes(props.network, notes).then(Boolean)}
        placeholder="Character, aliases, plot hooks..."
        scopeKey={props.network.id}
      />
    </ServerInspectorAccordionItem>
  );
}

function ServerInspectorAccordionItem(props: {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <details
      className="group rounded-sm border border-white/[0.055] bg-white/[0.018]"
      open={props.defaultOpen ?? true}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/72 outline-none transition-colors hover:text-foreground/84 focus-visible:ring-2 focus-visible:ring-ring/45 [&::-webkit-details-marker]:hidden">
        <span>{props.title}</span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/[0.045] px-2.5 py-2.5">
        {props.children}
      </div>
    </details>
  );
}

function ServerCapabilityInspector(props: {
  capabilities?: NetworkRuntimeCapabilities | null;
}) {
  const capabilities = props.capabilities ?? emptyNetworkRuntimeCapabilities();
  const negotiated = capabilities.negotiated;
  const pending = capabilities.pending;
  const unavailable = new Set([...negotiated, ...pending]);
  const offered = capabilities.offered.filter((capability) => !unavailable.has(capability));
  const hasCapabilities = negotiated.length > 0 || offered.length > 0 || pending.length > 0;
  if (!hasCapabilities) {
    return null;
  }
  return (
    <ServerInspectorAccordionItem title="Capabilities">
      <div className="space-y-2.5">
        <CapabilityGroup capabilities={negotiated} label="Active" variant="success" />
        <CapabilityGroup capabilities={offered} label="Offered" variant="secondary" />
        <CapabilityGroup capabilities={pending} label="Pending" variant="default" />
      </div>
    </ServerInspectorAccordionItem>
  );
}

function CapabilityGroup(props: {
  capabilities: string[];
  label: string;
  variant: BadgeProps['variant'];
}) {
  if (props.capabilities.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {props.label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {props.capabilities.map((capability) => (
          <Badge
            key={capability}
            variant={props.variant}
            className="max-w-full normal-case tracking-normal opacity-[0.82]"
          >
            <span className="truncate">{capability}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

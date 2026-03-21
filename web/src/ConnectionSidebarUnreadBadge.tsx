type ConnectionSidebarUnreadBadgeProps = {
  unread: number;
};

export function ConnectionSidebarUnreadBadge(props: ConnectionSidebarUnreadBadgeProps) {
  return (
    <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-muted-foreground">
      {props.unread}
    </span>
  );
}

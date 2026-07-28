import type { ComponentPropsWithoutRef } from 'react';
import Markdown, { type MarkdownToJSX } from 'markdown-to-jsx/react';

type AiAssistantMarkdownProps = {
  children: string;
};

export function AiAssistantMarkdown(props: AiAssistantMarkdownProps) {
  return (
    <Markdown options={markdownOptions}>
      {props.children}
    </Markdown>
  );
}

const markdownOptions = {
  disableParsingRawHTML: true,
  ignoreHTMLBlocks: true,
  tagfilter: true,
  wrapper: null,
  overrides: {
    a: { component: AssistantMarkdownLink },
    blockquote: {
      props: { className: 'border-l-2 border-primary/35 pl-3 text-foreground/72' },
    },
    code: {
      props: {
        className: 'rounded bg-black/30 px-1 py-0.5 font-mono text-[0.92em] text-foreground/92',
      },
    },
    h1: { props: { className: 'text-base font-semibold leading-6 text-foreground' } },
    h2: { props: { className: 'text-[15px] font-semibold leading-5 text-foreground' } },
    h3: { props: { className: 'text-sm font-semibold leading-5 text-foreground' } },
    hr: { props: { className: 'border-white/10' } },
    img: { component: AssistantMarkdownImage },
    input: { component: AssistantMarkdownCheckbox },
    li: { props: { className: 'pl-0.5 marker:text-muted-foreground' } },
    ol: { props: { className: 'list-decimal space-y-1 pl-5' } },
    p: { props: { className: 'whitespace-pre-wrap' } },
    pre: {
      props: {
        className: 'max-w-full overflow-x-auto rounded-md border border-white/[0.06] bg-black/30 p-2.5 text-[12px] leading-5 [&>code]:bg-transparent [&>code]:p-0',
      },
    },
    table: { component: AssistantMarkdownTable },
    td: {
      props: { className: 'border-t border-white/[0.06] px-2 py-1.5 align-top' },
    },
    th: {
      props: {
        className: 'bg-white/[0.035] px-2 py-1.5 font-semibold text-foreground/92',
      },
    },
    ul: { props: { className: 'list-disc space-y-1 pl-5' } },
  },
} satisfies MarkdownToJSX.Options;

function AssistantMarkdownLink(props: ComponentPropsWithoutRef<'a'>) {
  const external = isExternalLink(props.href);
  return (
    <a
      href={props.href}
      title={props.title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="font-medium text-primary underline decoration-primary/45 underline-offset-2 hover:decoration-primary"
    >
      {props.children}
    </a>
  );
}

function AssistantMarkdownImage(props: ComponentPropsWithoutRef<'img'>) {
  return <span className="text-muted-foreground">[Image: {props.alt || 'image'}]</span>;
}

function AssistantMarkdownCheckbox(props: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      type="checkbox"
      checked={props.checked}
      disabled
      readOnly
      className="mr-1.5 align-middle accent-primary"
    />
  );
}

function AssistantMarkdownTable(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-white/[0.06]">
      <table className="w-full border-collapse text-left text-[12px]">{props.children}</table>
    </div>
  );
}

const isExternalLink = (href: string | undefined) =>
  Boolean(href && (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')));

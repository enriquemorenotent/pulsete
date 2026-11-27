import { Editor } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect, useLayoutEffect, useRef } from 'react';

const extensions = [
  StarterKit.configure({ link: { openOnClick: false, enableClickSelection: true } }),
  TableKit,
  TaskItem.configure({ nested: true }),
  TaskList,
  // Keep image references in Markdown without fetching remote images in the editor.
  Image.extend({
    renderHTML({ node }) {
      return ['span', { class: 'text-muted-foreground' }, `[Image: ${node.attrs.alt || 'image'}]`];
    },
  }).configure({ inline: true }),
  Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
];

export function MarkdownNotesEditor({ id, value, placeholder, onChange }: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor>(null);
  const contentRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const editor = new Editor({
      element: hostRef.current,
      extensions,
      content: contentRef.current,
      contentType: 'markdown',
      editorProps: {
        attributes: {
          id,
          class: 'markdown-notes relative flex-1 rounded-sm border border-transparent px-1 py-1 text-[13px] leading-5 text-foreground/90 outline-none focus-visible:border-ring/50',
          role: 'textbox',
          'aria-label': 'Notes',
          'aria-multiline': 'true',
          'aria-placeholder': placeholder,
          'data-placeholder': placeholder,
        },
      },
      onUpdate({ editor }) {
        const markdown = editor.getMarkdown();
        if (markdown === contentRef.current) return;
        contentRef.current = markdown;
        onChangeRef.current(markdown);
      },
    });
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
      editor.destroy();
    };
  }, [id, placeholder]);

  useEffect(() => {
    if (value === contentRef.current) return;
    contentRef.current = value;
    editorRef.current?.chain()
      .setContent(value, { contentType: 'markdown', emitUpdate: false })
      .setMeta('addToHistory', false)
      .run();
  }, [value]);

  return <div ref={hostRef} data-notes-editor={id} className="flex flex-1 flex-col" />;
}

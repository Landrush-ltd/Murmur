import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useCallback } from 'react';

// ─── Toolbar button (defined outside component to avoid re-creation on render)

function ToolbarButton({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className={`editor-toolbar-btn${active ? ' editor-toolbar-btn-active' : ''}`}
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

interface NoteEditorProps {
  /** HTML content string from Tiptap */
  content: string;
  /** Called (debounced) when content changes */
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const DEBOUNCE_MS = 1200;

export function NoteEditor({
  content,
  onChange,
  placeholder = 'Write notes, thoughts, follow-ups…',
  autoFocus = false,
}: NoteEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdate = useCallback(
    (html: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(html), DEBOUNCE_MS);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    autofocus: autoFocus ? ('end' as const) : undefined,
    onUpdate: ({ editor: ed }) => handleUpdate(ed.getHTML()),
  });

  // Sync content from parent when selected doc changes
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="note-editor">
      <div className="editor-toolbar" aria-label="Text formatting">
        <ToolbarButton
          label="B"
          title="Bold (⌘B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          title="Italic (⌘I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="S"
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="H1"
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          label="H2"
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="•–"
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1–"
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="☐"
          title="Checklist"
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <span className="editor-toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label="⌫"
          title="Clear formatting"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        />
      </div>

      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

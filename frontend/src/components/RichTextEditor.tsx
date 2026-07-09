import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, CaseSensitive } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Synchronize internal HTML with outer value ONLY if they actually differ
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const executeCommand = (command: string, valueStr: string = '') => {
    document.execCommand(command, false, valueStr);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 bg-gray-50 border-b border-gray-200 p-2 select-none">
        <button
          type="button"
          onClick={() => executeCommand('bold')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => executeCommand('italic')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => executeCommand('underline')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button
          type="button"
          onClick={() => executeCommand('formatBlock', 'h1')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 font-bold text-xs font-mono cursor-pointer"
          title="Heading 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => executeCommand('formatBlock', 'h2')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 font-bold text-xs font-mono cursor-pointer"
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => executeCommand('formatBlock', 'p')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 font-bold text-xs font-mono cursor-pointer"
          title="Paragraph"
        >
          Normal
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button
          type="button"
          onClick={() => executeCommand('insertUnorderedList')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => executeCommand('insertOrderedList')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button
          type="button"
          onClick={() => executeCommand('removeFormat')}
          className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
          title="Clear Formatting"
        >
          <CaseSensitive className="h-4 w-4" />
        </button>
      </div>

      {/* Editable Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="p-4 min-h-[140px] max-h-72 overflow-y-auto outline-none text-sm rich-text-content focus:outline-none bg-white"
        data-placeholder={placeholder}
      />
    </div>
  );
}

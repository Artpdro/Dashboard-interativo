import { useCallback, useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, Link as LinkIcon, Unlink, Eraser, Undo2, Redo2, Highlighter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeEmailHtml, toHtml } from '@/lib/emailHtml';

const FONTS = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Calibri', 'Segoe UI'];
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  variables?: string[];
  className?: string;
}

function Btn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent text-foreground">
      {children}
    </button>
  );
}
const Sep = () => <span className="w-px h-5 bg-border mx-1" />;

export function RichTextEditor({ value, onChange, placeholder, minHeight = 160, variables, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtml = useRef<string>('');
  const savedRange = useRef<Range | null>(null);
  const pendingSize = useRef<number | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastHtml.current) {
      el.innerHTML = sanitizeEmailHtml(toHtml(value));
      lastHtml.current = value;
    }
  }, [value]);

  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    if (pendingSize.current) {
      const px = pendingSize.current;
      el.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement('span');
        span.style.fontSize = `${px}px`;
        span.innerHTML = (f as HTMLElement).innerHTML;
        f.replaceWith(span);
      });
      pendingSize.current = null;
    }
    let html = el.innerHTML;
    if (!el.textContent?.trim() && !el.querySelector('img,hr,table')) {
      html = '';
      if (el.innerHTML !== '') el.innerHTML = '';
    }
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
  };

  const exec = (command: string, arg?: string, useCss = false) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, useCss ? 'true' : 'false');
    document.execCommand(command, false, arg);
    emit();
  };

  const applyFontSize = (px: number) => {
    restoreSelection();
    pendingSize.current = px;
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    emit();
  };

  const insertVariable = (v: string) => { restoreSelection(); document.execCommand('insertText', false, v); emit(); };

  const addLink = () => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { alert('Selecione o texto que será o link.'); return; }
    let url = window.prompt('Endereço do link (ex.: https://site.com.br):');
    if (!url) return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
    exec('createLink', url);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) document.execCommand('insertHTML', false, sanitizeEmailHtml(html));
    else document.execCommand('insertText', false, text);
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); addLink(); }
  };

  const selectCls = 'h-8 rounded border border-input bg-background px-1.5 text-xs';

  return (
    <div className={cn('rounded-md border border-input bg-background', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <Btn title="Desfazer" onClick={() => exec('undo')}><Undo2 className="h-4 w-4" /></Btn>
        <Btn title="Refazer" onClick={() => exec('redo')}><Redo2 className="h-4 w-4" /></Btn>
        <Sep />
        <select className={cn(selectCls, 'w-28')} value="" title="Fonte"
          onChange={(e) => { if (e.target.value) exec('fontName', e.target.value, true); e.target.value = ''; }}>
          <option value="">Fonte</option>
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <select className={cn(selectCls, 'w-20')} value="" title="Tamanho da fonte"
          onChange={(e) => { if (e.target.value) applyFontSize(Number(e.target.value)); e.target.value = ''; }}>
          <option value="">Tamanho</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>
        <Sep />
        <Btn title="Negrito (Ctrl+B)" onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Itálico (Ctrl+I)" onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Sublinhado (Ctrl+U)" onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Btn>
        <Btn title="Riscado" onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Btn>
        <Sep />
        <label title="Cor do texto" className="h-8 w-8 inline-flex flex-col items-center justify-center rounded hover:bg-accent cursor-pointer">
          <span className="text-sm font-bold leading-none">A</span>
          <input type="color" defaultValue="#000000" className="h-1.5 w-5 p-0 border-0 cursor-pointer" onChange={(e) => exec('foreColor', e.target.value, true)} />
        </label>
        <label title="Cor de destaque" className="h-8 w-8 inline-flex flex-col items-center justify-center rounded hover:bg-accent cursor-pointer">
          <Highlighter className="h-3.5 w-3.5" />
          <input type="color" defaultValue="#ffff00" className="h-1.5 w-5 p-0 border-0 cursor-pointer" onChange={(e) => exec('hiliteColor', e.target.value, true)} />
        </label>
        <Sep />
        <Btn title="Alinhar à esquerda" onClick={() => exec('justifyLeft')}><AlignLeft className="h-4 w-4" /></Btn>
        <Btn title="Centralizar" onClick={() => exec('justifyCenter')}><AlignCenter className="h-4 w-4" /></Btn>
        <Btn title="Alinhar à direita" onClick={() => exec('justifyRight')}><AlignRight className="h-4 w-4" /></Btn>
        <Btn title="Justificar" onClick={() => exec('justifyFull')}><AlignJustify className="h-4 w-4" /></Btn>
        <Sep />
        <Btn title="Lista com marcadores" onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Btn>
        <Btn title="Lista numerada" onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Btn>
        <Sep />
        <Btn title="Inserir link (Ctrl+K)" onClick={addLink}><LinkIcon className="h-4 w-4" /></Btn>
        <Btn title="Remover link" onClick={() => exec('unlink')}><Unlink className="h-4 w-4" /></Btn>
        <Btn title="Limpar formatação" onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></Btn>
        {variables && variables.length > 0 && (
          <>
            <Sep />
            <select className={cn(selectCls, 'w-32')} value="" title="Inserir variável"
              onChange={(e) => { if (e.target.value) insertVariable(e.target.value); e.target.value = ''; }}>
              <option value="">+ Variável</option>
              {variables.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true"
        data-placeholder={placeholder} onInput={emit} onBlur={emit} onPaste={onPaste} onKeyDown={onKeyDown}
        className="rte-content rte-editor px-3 py-2 text-sm focus-visible:outline-none overflow-auto"
        style={{ minHeight, maxHeight: 420 }} />
    </div>
  );
}

import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Project } from '../../src/types.ts';
import { filterProjects } from '../project-search.ts';

export function ProjectPicker({ value, projects, onChange, disabled = false }: { value: string; projects: Project[]; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null), id = useId();
  const options = [{ id: '', title: t('project.all') }, ...filterProjects(projects, query)];
  const index = Math.min(active, options.length - 1);
  const selected = projects.find(project => project.id === value)?.title || t('project.all');
  const choose = (id: string) => { onChange(id); setOpen(false); };
  return <div className="project-picker"><span id={`${id}-label`}>{t('entity.project')}</span><Popover.Root open={open} onOpenChange={next => { setOpen(next); setQuery(''); setActive(0); }}>
    <Popover.Trigger asChild><button type="button" className="form-control-trigger project-picker__trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`}><span id={`${id}-value`}>{selected}</span><ChevronDown size={15} aria-hidden="true" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="project-picker__content" align="end" sideOffset={6} collisionPadding={12} onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}>
      <div className="project-picker__search"><Search size={15} aria-hidden="true" /><input ref={input} role="combobox" aria-label={t('project.search')} placeholder={t('project.search')} value={query} aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={`${id}-option-${index}`} autoComplete="off" onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index + 1) % options.length); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index - 1 + options.length) % options.length); }
        else if (event.key === 'Enter') { event.preventDefault(); choose(options[index].id); }
      }} /></div>
      <div id={`${id}-list`} className="project-picker__options" role="listbox" aria-label={t('entity.project')}>
        {options.map((option, optionIndex) => <button type="button" role="option" aria-selected={option.id === value} id={`${id}-option-${optionIndex}`} className={optionIndex === index ? 'is-highlighted' : ''} key={option.id || 'all'} onMouseEnter={() => setActive(optionIndex)} onClick={() => choose(option.id)}><span>{option.title}</span>{option.id === value && <Check size={14} aria-hidden="true" />}</button>)}
        {query.trim() && options.length === 1 && <p className="project-picker__empty">{t('project.noMatches')}</p>}
      </div>
    </Popover.Content></Popover.Portal>
  </Popover.Root></div>;
}

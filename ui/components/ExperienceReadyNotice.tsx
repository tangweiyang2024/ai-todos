import { useTranslation } from 'react-i18next';
import { CheckCircle2, ArrowUpRight, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

/** 提醒后台准备已完成；用户选择进入或稍后，不自动切换 Codex 窗口。 */
export function ExperienceReadyNotice({ title, busy, onOpen, onLater }: { title: string; busy: boolean; onOpen: () => void; onLater: () => void }) {
  const { t } = useTranslation();
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onLater(); }}><Dialog.Portal>
    <Dialog.Overlay className="task-editor-backdrop" />
    <Dialog.Content className="experience-ready-notice" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <button className="experience-ready-notice__close icon-button quiet" aria-label={t('common.closeDialog')} disabled={busy} onClick={onLater}><X size={16} /></button>
      <div className="experience-ready-notice__icon"><CheckCircle2 size={26} aria-hidden="true" /></div>
      <Dialog.Title>{t('wiki.captureReadyTitle')}</Dialog.Title>
      <p className="experience-ready-notice__source">{title}</p>
      <Dialog.Description className="experience-ready-notice__description">{t('wiki.captureReadyDescription')}</Dialog.Description>
      <div className="experience-ready-notice__actions"><button type="button" className="quiet" disabled={busy} onClick={onLater}>{t('wiki.captureLater')}</button><button type="button" disabled={busy} onClick={onOpen}><ArrowUpRight size={15} />{t('wiki.enterCapture')}</button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

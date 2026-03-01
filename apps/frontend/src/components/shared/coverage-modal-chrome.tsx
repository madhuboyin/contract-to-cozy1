'use client';

import React from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export const COVERAGE_MODAL_FORM_CLASS = 'space-y-0';
export const COVERAGE_MODAL_CONTENT_CLASS = 'modal-content space-y-4 px-6 pb-1 max-sm:px-4';
export const COVERAGE_MODAL_TWO_COL_GRID_CLASS = 'modal-field-grid-2col grid gap-4 sm:grid-cols-2';
export const COVERAGE_MODAL_LABEL_CLASS = 'block text-xs font-medium text-[#374151]';
export const COVERAGE_MODAL_INPUT_CLASS =
  'h-[40px] w-full border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] transition-[border-color,box-shadow] focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/10 focus-visible:border-[#0D9488] focus-visible:ring-[3px] focus-visible:ring-[#0D9488]/10 disabled:cursor-not-allowed disabled:opacity-[0.45] disabled:bg-gray-50';
export const COVERAGE_MODAL_SELECT_TRIGGER_CLASS =
  'h-[40px] border border-[#E5E7EB] bg-white px-3 pr-9 text-sm text-[#111827] transition-[border-color,box-shadow] focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/10 disabled:cursor-not-allowed disabled:opacity-[0.45] disabled:bg-gray-50';
export const COVERAGE_MODAL_DATE_INPUT_CLASS =
  `${COVERAGE_MODAL_INPUT_CLASS} appearance-none pr-9 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`;
export const COVERAGE_MODAL_FIELD_HINT_CLASS = 'field-hint mt-1 text-[11px] leading-[1.4] text-[#9CA3AF]';
export const COVERAGE_MODAL_FIELD_HINT_CONDITIONAL_CLASS =
  'field-hint field-hint-conditional mt-1 text-[11px] leading-[1.4] text-[#0D9488]';
export const COVERAGE_MODAL_NOTES_TEXTAREA_CLASS =
  'coverage-notes-textarea h-[56px] min-h-[56px] max-h-[200px] resize-y border border-[#E5E7EB] bg-white px-3 py-[10px] text-[13px] leading-[1.5] text-[#111827] transition-[height,border-color,box-shadow] duration-200 focus:h-[100px] focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/10';

interface CoverageModalHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  iconClassName?: string;
}

export function CoverageModalHeader({ icon, title, subtitle, iconClassName }: CoverageModalHeaderProps) {
  return (
    <div className="modal-header-strip mb-5 flex items-start gap-[14px] border-b border-[#E5E7EB] px-6 pb-4 pt-5 max-sm:px-4 max-sm:pb-3 max-sm:pt-4">
      <div
        className={cn(
          'modal-header-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#CCFBF1] bg-[#F0FDFA] text-[#0D9488]',
          iconClassName
        )}
      >
        {icon}
      </div>
      <div className="modal-header-text flex flex-col gap-[3px]">
        <DialogTitle className="modal-title m-0 text-lg font-bold text-[#111827]">{title}</DialogTitle>
        <p className="modal-subtitle m-0 text-[13px] text-[#6B7280]">{subtitle}</p>
      </div>
    </div>
  );
}

interface CoverageModalFooterProps {
  onClose: () => void;
  isSubmitting: boolean;
  isEditMode: boolean;
  createLabel: string;
  submitDisabled?: boolean;
}

export function CoverageModalFooter({
  onClose,
  isSubmitting,
  isEditMode,
  createLabel,
  submitDisabled = false,
}: CoverageModalFooterProps) {
  return (
    <div className="modal-footer mt-5 flex flex-col gap-3 border-t border-[#E5E7EB] px-6 py-4 max-sm:px-4 sm:flex-row sm:items-center sm:justify-end">
      <div className="modal-footer-actions flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-[10px]">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
          className="h-[48px] w-full justify-center sm:h-[40px] sm:w-auto"
        >
          <X className="mr-2 h-4 w-4" /> Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitDisabled || isSubmitting}
          className="h-[48px] w-full justify-center sm:h-[40px] sm:w-auto"
        >
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isEditMode ? 'Save Changes' : createLabel}
        </Button>
      </div>
    </div>
  );
}

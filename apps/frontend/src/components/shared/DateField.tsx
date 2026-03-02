'use client';

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
}

const DATE_FIELD_INPUT_CLASS =
  'h-[40px] w-full border border-[#E5E7EB] bg-white px-3 pr-9 text-sm text-[#111827] transition-[border-color,box-shadow] focus:border-[#0D9488] focus:ring-[3px] focus:ring-[#0D9488]/10 focus-visible:border-[#0D9488] focus-visible:ring-[3px] focus-visible:ring-[#0D9488]/10 disabled:cursor-not-allowed disabled:opacity-[0.45] disabled:bg-gray-50 appearance-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0';

export default function DateField({
  id,
  label,
  value,
  onChange,
  required = false,
  min,
  max,
  className,
  labelClassName,
  inputClassName,
}: DateFieldProps) {
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <label htmlFor={id} className={cn('block text-sm font-medium text-gray-700', labelClassName)}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          min={min}
          max={max}
          className={cn(DATE_FIELD_INPUT_CLASS, inputClassName)}
        />
        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
      </div>
    </div>
  );
}
